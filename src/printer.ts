import { OrderItem } from './types';
import { db } from './db';
import { logger } from './utils/logger';
import { getBillTranslations } from './i18n';

// ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';
const INIT = ESC + '@'; // Initialize printer
const BOLD_ON = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';
const CENTER = ESC + 'a' + '\x01';
const LEFT = ESC + 'a' + '\x00';
const RIGHT = ESC + 'a' + '\x02';
const CUT = GS + 'V' + '\x41' + '\x10'; // Partial cut
const DOUBLE_HEIGHT_ON = ESC + '!' + '\x10';
const DOUBLE_HW_ON = ESC + '!' + '\x30'; // Double Height + Double Width
const DOUBLE_HEIGHT_OFF = ESC + '!' + '\x00';

// ── Serial write with timeout to prevent port hangs ───────────────────────────
const writeWithTimeout = (
  writer: WritableStreamDefaultWriter<Uint8Array>,
  data: Uint8Array,
  timeoutMs = 5000
): Promise<void> => {
  return Promise.race([
    writer.write(data),
    new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new Error('[Printer] Write timeout — port may be disconnected or out of paper')),
        timeoutMs
      )
    )
  ]);
};

export class ThermalPrinter {
  private static port: any = null;
  private static receiptPort: any = null;
  private static kotPort: any = null;
  private static barPort: any = null;

  static get isConnected() { return !!this.port; }
  static get isReceiptConnected() { return !!this.receiptPort; }
  static get isKOTConnected() { return !!this.kotPort; }
  static get isBarConnected() { return !!this.barPort; }

  private static btDevices = new Map<string, any>();
  private static btCharacteristics = new Map<string, any>();

  private static createMockBluetoothPort(targetKey: string) {
    return {
      isBluetooth: true,
      close: async () => {
        const dev = ThermalPrinter.btDevices.get(targetKey);
        if (dev && dev.gatt && dev.gatt.connected) {
          try { await dev.gatt.disconnect(); } catch (_) {}
        }
        ThermalPrinter.btDevices.delete(targetKey);
        ThermalPrinter.btCharacteristics.delete(targetKey);
        (ThermalPrinter as any)[targetKey] = null;
      },
      writable: {
        locked: false,
        getWriter() {
          this.locked = true;
          return {
            write: async (data: Uint8Array) => {
              const char = ThermalPrinter.btCharacteristics.get(targetKey);
              if (!char) throw new Error('Bluetooth printer not connected');
              const chunkSize = 20;
              for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                await char.writeValue(chunk);
                await new Promise(r => setTimeout(r, 15));
              }
            },
            releaseLock: () => {
              this.locked = false;
            }
          };
        }
      },
      getInfo() {
        return {};
      }
    };
  }

  private static async connectBluetoothDevice(targetKey: 'port' | 'receiptPort' | 'kotPort' | 'barPort'): Promise<boolean> {
    try {
      if (!('bluetooth' in navigator)) {
        throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome on Android.');
      }
      
      logger.log(`[Printer] Connecting Bluetooth device for ${targetKey}...`);
      const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
      
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { services: [PRINTER_SERVICE_UUID] },
          { namePrefix: 'Printer' },
          { namePrefix: 'MTP' },
          { namePrefix: 'PT' }
        ],
        optionalServices: [
          PRINTER_SERVICE_UUID,
          '49535343-fe7d-4158-b8db-883a2c146d5d',
          '0000e781-0000-1000-8000-00805f9b34fb'
        ]
      });

      const server = await device.gatt!.connect();
      
      let service;
      try {
        service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
      } catch (e) {
        try {
          service = await server.getPrimaryService('49535343-fe7d-4158-b8db-883a2c146d5d');
        } catch (e2) {
          service = await server.getPrimaryService('0000e781-0000-1000-8000-00805f9b34fb');
        }
      }

      const characteristics = await service.getCharacteristics();
      const writeChar = characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
      if (!writeChar) {
        throw new Error('Write characteristic not found on this Bluetooth device.');
      }

      this.btDevices.set(targetKey, device);
      this.btCharacteristics.set(targetKey, writeChar);
      
      localStorage.setItem(`${targetKey}BluetoothName`, device.name || 'Bluetooth Printer');

      const mockPort = this.createMockBluetoothPort(targetKey);
      (this as any)[targetKey] = mockPort;

      // Verify connection
      await writeChar.writeValue(new TextEncoder().encode(INIT));
      logger.log(`[Printer] Bluetooth printer connected as ${targetKey}:`, device.name);
      return true;
    } catch (err) {
      logger.error(`[Printer] Bluetooth connection failed for ${targetKey}:`, err);
      throw err;
    }
  }

  // Generic port-level mutex queue map
  private static portQueues = new Map<any, Promise<void>>();

  private static enqueuePort<T>(port: any, job: () => Promise<T>): Promise<T> {
    if (!port) return job();
    const currentQueue = this.portQueues.get(port) || Promise.resolve();
    let result: T;
    const nextQueue = currentQueue.then(async () => {
      try {
        result = await job();
      } catch (err) {
        logger.error('[Printer] Port queue error:', err);
        throw err;
      }
    });
    const caughtQueue = nextQueue.catch(() => {});
    this.portQueues.set(port, caughtQueue);
    caughtQueue.then(() => {
      if (this.portQueues.get(port) === caughtQueue) {
        this.portQueues.delete(port);
      }
    });
    return nextQueue.then(() => result);
  }

  private static async verifyConnectivity(port: any): Promise<boolean> {
    if (!port || !port.writable) return false;
    const encoder = new TextEncoder();
    const writer = port.writable.getWriter();
    try {
      await writeWithTimeout(writer, encoder.encode(INIT));
      return true;
    } catch (e) {
      logger.error('[Printer] Port verification failed:', e);
      return false;
    } finally {
      try { writer.releaseLock(); } catch (_) {}
    }
  }

  static async autoConnect() {
    try {
      if (!('serial' in navigator)) return false;
      const ports = await (navigator as any).serial.getPorts();
      if (ports.length > 0) {
        const settings = (await Promise.all([db.restaurantProfile.get('global'), db.restaurantSettings.get('global')])).reduce((a,b)=>({...(a||{}), ...(b||{})}), {}) as any;
        const baudRate = settings?.baudRate || 9600;
        
        const isAssigned = (p: any) => {
          return p && (p === this.port || p === this.receiptPort || p === this.kotPort || p === this.barPort);
        };

        // 1. Single generic printer connection
        const savedVendorId = localStorage.getItem('printerVendorId');
        const savedProductId = localStorage.getItem('printerProductId');
        if (savedVendorId && savedProductId) {
          const targetPort = ports.find((p: any) => {
            const info = p.getInfo();
            return info.usbVendorId?.toString() === savedVendorId && info.usbProductId?.toString() === savedProductId && !isAssigned(p);
          });
          if (targetPort && !targetPort.readable) {
            await targetPort.open({ baudRate });
            const verified = await this.verifyConnectivity(targetPort);
            if (verified) {
              this.port = targetPort;
            } else {
              try { await targetPort.close(); } catch (_) {}
            }
          }
        }

        // 2. Receipt printer connection
        const rVendorId = localStorage.getItem('receiptPrinterVendorId');
        const rProductId = localStorage.getItem('receiptPrinterProductId');
        if (rVendorId && rProductId) {
          const targetPort = ports.find((p: any) => {
            const info = p.getInfo();
            return info.usbVendorId?.toString() === rVendorId && info.usbProductId?.toString() === rProductId && !isAssigned(p);
          });
          if (targetPort && !targetPort.readable) {
            await targetPort.open({ baudRate });
            const verified = await this.verifyConnectivity(targetPort);
            if (verified) {
              this.receiptPort = targetPort;
            } else {
              try { await targetPort.close(); } catch (_) {}
            }
          }
        }

        // 3. KOT printer connection
        const kVendorId = localStorage.getItem('kotPrinterVendorId');
        const kProductId = localStorage.getItem('kotPrinterProductId');
        if (kVendorId && kProductId) {
          const targetPort = ports.find((p: any) => {
            const info = p.getInfo();
            return info.usbVendorId?.toString() === kVendorId && info.usbProductId?.toString() === kProductId && !isAssigned(p);
          });
          if (targetPort && !targetPort.readable) {
            await targetPort.open({ baudRate });
            const verified = await this.verifyConnectivity(targetPort);
            if (verified) {
              this.kotPort = targetPort;
            } else {
              try { await targetPort.close(); } catch (_) {}
            }
          }
        }
        
        // 4. Bar printer connection
        const bVendorId = localStorage.getItem('barPrinterVendorId');
        const bProductId = localStorage.getItem('barPrinterProductId');
        if (bVendorId && bProductId) {
          const targetPort = ports.find((p: any) => {
            const info = p.getInfo();
            return info.usbVendorId?.toString() === bVendorId && info.usbProductId?.toString() === bProductId && !isAssigned(p);
          });
          if (targetPort && !targetPort.readable) {
            await targetPort.open({ baudRate });
            const verified = await this.verifyConnectivity(targetPort);
            if (verified) {
              this.barPort = targetPort;
            } else {
              try { await targetPort.close(); } catch (_) {}
            }
          }
        }
        
        return !!this.port || !!this.receiptPort || !!this.kotPort || !!this.barPort;
      }
    } catch (err) {
      logger.error('Printer Auto-Connect Error:', err);
    }
    return false;
  }

  static async connect(forceSwitch: boolean = false) {
    try {
      if (forceSwitch && this.port) {
        try {
          await this.port.close();
        } catch (e) {}
        this.port = null;
      }

      const settings = (await Promise.all([db.restaurantProfile.get('global'), db.restaurantSettings.get('global')])).reduce((a,b)=>({...(a||{}), ...(b||{})}), {}) as any;
      const baudRate = settings?.baudRate || 9600;

      if (!this.port) {
        const isElectron = !!(window as any).electronAPI;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isElectron && (isMobile || !('serial' in navigator))) {
          if ('bluetooth' in navigator) {
            return this.connectBluetoothDevice('port');
          }
          throw new Error('Web Serial and Web Bluetooth are not supported in this browser.');
        }

        if (!('serial' in navigator)) {
          throw new Error('Web Serial API not supported in this browser. Please use Chrome/Edge for receipt printing.');
        }
        const ports = await (navigator as any).serial.getPorts();
        const savedVendorId = localStorage.getItem('printerVendorId');
        const savedProductId = localStorage.getItem('printerProductId');
        
        let knownPort = null;
        if (savedVendorId && savedProductId) {
          knownPort = ports.find((p: any) => {
            const info = p.getInfo();
            return info.usbVendorId?.toString() === savedVendorId && info.usbProductId?.toString() === savedProductId;
          });
        }

        let selectedPort = null;
        if (ports.length > 0 && !forceSwitch && knownPort) {
            selectedPort = knownPort;
        } else if (ports.length === 1 && !forceSwitch) {
            selectedPort = ports[0];
        } else {
            selectedPort = await (navigator as any).serial.requestPort();
        }

        // Prevent double assignment
        if (selectedPort === this.receiptPort || selectedPort === this.kotPort) {
          throw new Error('This serial port is already assigned to another printer connection.');
        }

        this.port = selectedPort;
      }

      if (this.port) {
        if ((this.port as any).isBluetooth) {
          return true;
        }
        if (!this.port.readable) {
          await this.port.open({ baudRate });
        }
        const verified = await this.verifyConnectivity(this.port);
        if (!verified) {
          throw new Error('Failed to verify printer connectivity after connection.');
        }
        
        const info = this.port.getInfo();
        if (info.usbVendorId && info.usbProductId) {
          localStorage.setItem('printerVendorId', info.usbVendorId.toString());
          localStorage.setItem('printerProductId', info.usbProductId.toString());
        }
      }

      return true;
    } catch (err) {
      logger.error('Error connecting to printer:', err);
      this.port = null;
      throw err;
    }
  }

  static async connectReceipt(forceSwitch: boolean = false) {
    try {
      if (forceSwitch && this.receiptPort) {
        try {
          await this.receiptPort.close();
        } catch (e) {}
        this.receiptPort = null;
      }

      const settings = (await Promise.all([db.restaurantProfile.get('global'), db.restaurantSettings.get('global')])).reduce((a,b)=>({...(a||{}), ...(b||{})}), {}) as any;
      const baudRate = settings?.baudRate || 9600;

      if (!this.receiptPort) {
        const isElectron = !!(window as any).electronAPI;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isElectron && (isMobile || !('serial' in navigator))) {
          if ('bluetooth' in navigator) {
            return this.connectBluetoothDevice('receiptPort');
          }
          throw new Error('Web Serial and Web Bluetooth are not supported in this browser.');
        }

        if (!('serial' in navigator)) {
          throw new Error('Web Serial API not supported in this browser.');
        }
        const ports = await (navigator as any).serial.getPorts();
        const rVendorId = localStorage.getItem('receiptPrinterVendorId');
        const rProductId = localStorage.getItem('receiptPrinterProductId');
        
        let knownPort = null;
        if (rVendorId && rProductId) {
          knownPort = ports.find((p: any) => {
            const info = p.getInfo();
            return info.usbVendorId?.toString() === rVendorId && info.usbProductId?.toString() === rProductId;
          });
        }

        let selectedPort = null;
        if (ports.length > 0 && !forceSwitch && knownPort) {
            selectedPort = knownPort;
        } else {
            selectedPort = await (navigator as any).serial.requestPort();
        }

        // Prevent double assignment
        if (selectedPort === this.port || selectedPort === this.kotPort) {
          throw new Error('This serial port is already assigned to another printer connection.');
        }

        this.receiptPort = selectedPort;
      }

      if (this.receiptPort) {
        if ((this.receiptPort as any).isBluetooth) {
          return true;
        }
        if (!this.receiptPort.readable) {
          await this.receiptPort.open({ baudRate });
        }
        const verified = await this.verifyConnectivity(this.receiptPort);
        if (!verified) {
          throw new Error('Failed to verify printer connectivity after connection.');
        }
        
        const info = this.receiptPort.getInfo();
        if (info.usbVendorId && info.usbProductId) {
          localStorage.setItem('receiptPrinterVendorId', info.usbVendorId.toString());
          localStorage.setItem('receiptPrinterProductId', info.usbProductId.toString());
        }
      }

      return true;
    } catch (err) {
      logger.error('Error connecting to receipt printer:', err);
      this.receiptPort = null;
      throw err;
    }
  }

  static async connectKOT(forceSwitch: boolean = false) {
    try {
      if (forceSwitch && this.kotPort) {
        try {
          await this.kotPort.close();
        } catch (e) {}
        this.kotPort = null;
      }

      const settings = (await Promise.all([db.restaurantProfile.get('global'), db.restaurantSettings.get('global')])).reduce((a,b)=>({...(a||{}), ...(b||{})}), {}) as any;
      const baudRate = settings?.baudRate || 9600;

      if (!this.kotPort) {
        const isElectron = !!(window as any).electronAPI;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isElectron && (isMobile || !('serial' in navigator))) {
          if ('bluetooth' in navigator) {
            return this.connectBluetoothDevice('kotPort');
          }
          throw new Error('Web Serial and Web Bluetooth are not supported in this browser.');
        }

        if (!('serial' in navigator)) {
          throw new Error('Web Serial API not supported in this browser.');
        }
        const ports = await (navigator as any).serial.getPorts();
        const kVendorId = localStorage.getItem('kotPrinterVendorId');
        const kProductId = localStorage.getItem('kotPrinterProductId');
        
        let knownPort = null;
        if (kVendorId && kProductId) {
          knownPort = ports.find((p: any) => {
            const info = p.getInfo();
            return info.usbVendorId?.toString() === kVendorId && info.usbProductId?.toString() === kProductId;
          });
        }

        let selectedPort = null;
        if (ports.length > 0 && !forceSwitch && knownPort) {
            selectedPort = knownPort;
        } else {
            selectedPort = await (navigator as any).serial.requestPort();
        }

        // Prevent double assignment
        if (selectedPort === this.port || selectedPort === this.receiptPort) {
          throw new Error('This serial port is already assigned to another printer connection.');
        }

        this.kotPort = selectedPort;
      }

      if (this.kotPort) {
        if ((this.kotPort as any).isBluetooth) {
          return true;
        }
        if (!this.kotPort.readable) {
          await this.kotPort.open({ baudRate });
        }
        const verified = await this.verifyConnectivity(this.kotPort);
        if (!verified) {
          throw new Error('Failed to verify printer connectivity after connection.');
        }
        
        const info = this.kotPort.getInfo();
        if (info.usbVendorId && info.usbProductId) {
          localStorage.setItem('kotPrinterVendorId', info.usbVendorId.toString());
          localStorage.setItem('kotPrinterProductId', info.usbProductId.toString());
        }
      }

      return true;
    } catch (err) {
      logger.error('Error connecting to KOT printer:', err);
      this.kotPort = null;
      throw err;
    }
  }

  static async connectBar(forceSwitch: boolean = false) {
    try {
      if (forceSwitch && this.barPort) {
        try {
          await this.barPort.close();
        } catch (e) {}
        this.barPort = null;
      }

      const settings = (await Promise.all([db.restaurantProfile.get('global'), db.restaurantSettings.get('global')])).reduce((a,b)=>({...(a||{}), ...(b||{})}), {}) as any;
      const baudRate = settings?.baudRate || 9600;

      if (!this.barPort) {
        const isElectron = !!(window as any).electronAPI;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isElectron && (isMobile || !('serial' in navigator))) {
          if ('bluetooth' in navigator) {
            return this.connectBluetoothDevice('barPort');
          }
          throw new Error('Web Serial and Web Bluetooth are not supported in this browser.');
        }

        if (!('serial' in navigator)) {
          throw new Error('Web Serial API not supported in this browser.');
        }
        const ports = await (navigator as any).serial.getPorts();
        const bVendorId = localStorage.getItem('barPrinterVendorId');
        const bProductId = localStorage.getItem('barPrinterProductId');

        let knownPort = null;
        if (bVendorId && bProductId) {
          knownPort = ports.find((p: any) => {
            const info = p.getInfo();
            return info.usbVendorId?.toString() === bVendorId && info.usbProductId?.toString() === bProductId;
          });
        }

        let selectedPort = null;
        if (ports.length > 0 && !forceSwitch && knownPort) {
            selectedPort = knownPort;
        } else {
            selectedPort = await (navigator as any).serial.requestPort();
        }

        // Prevent double assignment
        if (selectedPort === this.port || selectedPort === this.receiptPort || selectedPort === this.kotPort) {
          throw new Error('This serial port is already assigned to another printer connection.');
        }

        this.barPort = selectedPort;
      }

      if (this.barPort) {
        if ((this.barPort as any).isBluetooth) {
          return true;
        }
        if (!this.barPort.readable) {
          await this.barPort.open({ baudRate });
        }
        const verified = await this.verifyConnectivity(this.barPort);
        if (!verified) {
          throw new Error('Failed to verify bar printer connectivity after connection.');
        }

        const info = this.barPort.getInfo();
        if (info.usbVendorId && info.usbProductId) {
          localStorage.setItem('barPrinterVendorId', info.usbVendorId.toString());
          localStorage.setItem('barPrinterProductId', info.usbProductId.toString());
        }
      }

      return true;
    } catch (err) {
      logger.error('Error connecting to Bar printer:', err);
      this.barPort = null;
      throw err;
    }
  }

  static async printReceipt(
    tableId: string | number, 
    items: OrderItem[], 
    subtotal: number, 
    tax: number, 
    total: number, 
    paymentMethod: string, 
    billNumber: number, 
    settings: any,
    discount: number = 0,
    customerName: string = '',
    customerPhone: string = '',
    billDate?: Date | number | string
  ) {
    const printerMode = settings?.printerMode || 'single';
    const activePort = printerMode === 'multiple' ? this.receiptPort : (this.port || this.receiptPort);
    if (!activePort) throw new Error('Receipt Printer not connected');

    return this.enqueuePort(activePort, async () => {
      // Wait for any pending write on this port to finish
      if (activePort.writable.locked) {
        await new Promise<void>((resolve, reject) => {
          const startTime = Date.now();
          const check = setInterval(() => {
            if (!activePort.writable.locked) {
              clearInterval(check);
              resolve();
            } else if (Date.now() - startTime > 5000) {
              clearInterval(check);
              reject(new Error('Printer Port Lock Timeout'));
            }
          }, 50);
        });
      }

      const width = settings?.printerWidth || 32;
      const encoder = new TextEncoder();
      const writer = activePort.writable.getWriter();

      try {
        const t = getBillTranslations(settings?.billLanguage);
        let receipt = INIT + '\n'; 
        
        const restaurantName = (settings?.restaurantName || 'RESTAURANT POS').toUpperCase();
        let formattedName = '';
        const words = restaurantName.split(' ');
        let currentLine = '';
        words.forEach((word: string) => {
            if ((currentLine + word).length > (width / 2)) {
                if (currentLine) {
                    formattedName += currentLine.trim() + '\n';
                    currentLine = word + ' ';
                } else {
                    formattedName += word.substring(0, width / 2) + '\n';
                    currentLine = word.substring(width / 2) + ' ';
                }
            } else {
                currentLine += word + ' ';
            }
        });
        if (currentLine) formattedName += currentLine.trim() + '\n';

        receipt += CENTER + BOLD_ON + DOUBLE_HW_ON + formattedName + BOLD_OFF + DOUBLE_HEIGHT_OFF;
        if (settings?.address && settings?.printAddress !== false) receipt += CENTER + `${settings.address}\n`;
        if (settings?.phone && settings?.printPhone !== false) receipt += CENTER + `Ph: ${settings.phone}\n`;
        if (settings?.email && settings?.printEmail !== false) receipt += CENTER + `${settings.email}\n`;
        if (settings?.fssaiNumber && settings?.printFssai !== false) receipt += CENTER + `FSSAI: ${settings.fssaiNumber}\n`;
        if (settings?.gstNumber && settings?.printGst !== false) receipt += CENTER + `GSTIN: ${settings.gstNumber}\n`;
        
        const separator = '-'.repeat(width) + '\n';
        receipt += separator;
        receipt += LEFT + BOLD_ON + `${t.bill.billNo}: ${billNumber.toString().padStart(6, '0')}\n` + BOLD_OFF;
        if (customerName) receipt += `${t.bill.customer}: ${customerName}\n`;
        if (customerPhone) receipt += `${t.bill.phone}: ${customerPhone}\n`;
        receipt += `${t.bill.table}: ${tableId}\n`;
        const displayDate = billDate ? new Date(billDate) : new Date();
        receipt += `${t.bill.date}: ${displayDate.toLocaleString()}\n`;
        receipt += separator;
        
        // Items header: Item (Width-14) Qty (3) Price (9)
        const nameWidth = width - 14;
        receipt += LEFT + BOLD_ON + t.items.item.padEnd(nameWidth) + t.items.qty.padStart(5) + t.items.price.padStart(9) + '\n' + BOLD_OFF;
        
        items.forEach(order => {
          if (!order) return;
          let fullName = order.menuItem?.name || order.name || t.items.unknown;
          let firstLineName = "";
          let remainingName = "";

          if (fullName.length <= nameWidth) {
            firstLineName = fullName;
          } else {
            let splitIndex = fullName.lastIndexOf(' ', nameWidth);
            if (splitIndex === -1) splitIndex = nameWidth;
            firstLineName = fullName.substring(0, splitIndex);
            remainingName = fullName.substring(splitIndex).trim();
          }

          firstLineName = firstLineName.padEnd(nameWidth, ' ');
          let qty = (order.quantity || 0).toString().padStart(5, ' ');
          let itemPrice = (order.menuItem?.price || order.price || 0);
          let price = (itemPrice * order.quantity).toFixed(2).padStart(9, ' ');
          receipt += `${firstLineName}${qty}${price}\n`;
          
          if (remainingName) {
             receipt += `${remainingName}\n`;
          }
        });
        
        receipt += separator;
        receipt += RIGHT + `${t.totals.subtotal}: ${t.currency.symbol} ${subtotal.toFixed(2)}\n`;
        if (discount > 0) {
          receipt += `${t.totals.discount}: -${t.currency.symbol} ${discount.toFixed(2)}\n`;
        }
        if (settings?.gstPercentage > 0) {
          receipt += `${t.totals.gst} (${settings.gstPercentage}%): ${t.currency.symbol} ${tax.toFixed(2)}\n`;
        }
        receipt += LEFT + separator;
        receipt += CENTER + BOLD_ON + DOUBLE_HEIGHT_ON + `${t.totals.total}: ${t.currency.symbol} ${total.toFixed(2)}\n` + BOLD_OFF + DOUBLE_HEIGHT_OFF;
        receipt += CENTER + `${t.totals.payment}: ${paymentMethod}\n`;
        receipt += LEFT + separator;

        // ── UPI QR Code — Canvas Raster Bitmap (works on ALL thermal printers) ──
        // Strategy: Generate QR via 'qrcode' lib → draw on OffscreenCanvas →
        // convert pixels to 1-bit raster data → send via GS v 0 (bit-image command).
        // This approach bypasses printer-native QR commands (GS ( k) which are
        // unsupported on many cheap/Chinese thermal printers.
        if (settings?.printQrCode !== false && settings?.upiId) {
          try {
            const safeUpiId = settings.upiId.trim();
            const safeName  = restaurantName.replace(/[&=]/g, '').trim();
            const billRef   = String(billNumber).padStart(6, '0');
            const params    = new URLSearchParams();
            params.set('pa', safeUpiId);
            params.set('pn', safeName);
            params.set('am', total.toFixed(2));   // NPCI: 2 decimal places
            params.set('cu', 'INR');
            params.set('tn', `Bill No ${billRef}`);
            params.set('tr', `BILL${billRef}`);
            const upiLink = 'upi://pay?' + params.toString().replace(/\+/g, '%20');

            // Dynamically import qrcode to keep bundle lean
            const QRCode = (await import('qrcode')).default;

            // ── Step 1: Render QR to an OffscreenCanvas ──────────────────────
            // Paper width:  58mm printer → ~384px wide; 80mm → ~576px wide
            // We target 280px QR square so it fits either paper with margins
            const QR_PX    = 280;   // canvas pixel size of the QR square
            const MARGIN   = 8;     // quiet-zone margin in pixels
            const TOTAL_PX = QR_PX + MARGIN * 2;

            const offscreen = new OffscreenCanvas(TOTAL_PX, TOTAL_PX);
            const ctx = offscreen.getContext('2d')!;

            // White background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, TOTAL_PX, TOTAL_PX);

            // Draw QR code using qrcode lib — toCanvas draws in-place and returns void
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width  = QR_PX;
            tmpCanvas.height = QR_PX;
            await QRCode.toCanvas(tmpCanvas, upiLink, {
              errorCorrectionLevel: 'H',   // Highest — survives minor print damage
              margin: 1,
              width: QR_PX,
              color: { dark: '#000000', light: '#FFFFFF' }
            });
            // Copy rendered QR from temp canvas to offscreen canvas (centered with margin)
            ctx.drawImage(tmpCanvas, MARGIN, MARGIN);

            // ── Step 2: Convert canvas pixels → 1-bit raster bytes ───────────
            const imageData = ctx.getImageData(0, 0, TOTAL_PX, TOTAL_PX);
            const pixels    = imageData.data;   // RGBA, 4 bytes per pixel

            // ESC/POS GS v 0 raster image:
            // Each byte represents 8 horizontal pixels (MSB = leftmost)
            const bytesPerRow = Math.ceil(TOTAL_PX / 8);
            const rasterBytes = new Uint8Array(bytesPerRow * TOTAL_PX);

            for (let y = 0; y < TOTAL_PX; y++) {
              for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                  const x = byteIdx * 8 + bit;
                  if (x < TOTAL_PX) {
                    const pixelBase = (y * TOTAL_PX + x) * 4;
                    const r = pixels[pixelBase];
                    const g = pixels[pixelBase + 1];
                    const b = pixels[pixelBase + 2];
                    // Pixel is "dark" if luminance < 128
                    if (r * 0.299 + g * 0.587 + b * 0.114 < 128) {
                      byte |= (0x80 >> bit);   // MSB first
                    }
                  }
                }
                rasterBytes[y * bytesPerRow + byteIdx] = byte;
              }
            }

            // ── Step 3: Build GS v 0 command ─────────────────────────────────
            // GS v 0: 1D 76 30 m xL xH yL yH [data]
            //   m  = 0x00 (normal density, 1x scale)
            //   xL xH = bytes per row (little-endian)
            //   yL yH = number of rows (little-endian)
            const xL = bytesPerRow & 0xFF;
            const xH = (bytesPerRow >> 8) & 0xFF;
            const yL = TOTAL_PX & 0xFF;
            const yH = (TOTAL_PX >> 8) & 0xFF;
            const rasterCmd = new Uint8Array([
              0x1D, 0x76, 0x30, 0x00,  // GS v 0, normal density
              xL, xH, yL, yH,
              ...rasterBytes
            ]);

            // ── Step 4: Write to printer ──────────────────────────────────────
            receipt += CENTER + `${t.upi.scanToPay}  ${t.currency.symbol} ${total.toFixed(2)}  ${t.upi.via}\n`;
            await writeWithTimeout(writer, encoder.encode(receipt));
            receipt = '';
            // Center the image: send ESC a 1 (center align) before image
            await writeWithTimeout(writer, new Uint8Array([0x1B, 0x61, 0x01]));
            await writeWithTimeout(writer, rasterCmd, 10000);
            // Restore left align after image
            await writeWithTimeout(writer, new Uint8Array([0x1B, 0x61, 0x00]));
            receipt += '\n' + CENTER + `UPI: ${safeUpiId}\n`;
            receipt += separator;
          } catch (qrErr) {
            logger.error('[Printer] QR raster generation failed:', qrErr);
            // Fallback: print UPI ID as plain text
            receipt += CENTER + `UPI: ${settings.upiId}\n`;
            receipt += separator;
          }
        }

        if (settings?.printThankYou !== false) {
          let msg = settings?.thankYouMessage;
          if (!msg) {
            msg = `${t.footer.thankYou}\n${t.footer.visitAgain}`;
          }
          receipt += CENTER + separator;
          msg.split('\n').forEach((line: string) => {
             receipt += CENTER + BOLD_ON + `*** ${line} ***\n` + BOLD_OFF;
          });
          receipt += CENTER + separator;
        }
        receipt += '\n\n\n' + CUT; 

        await writeWithTimeout(writer, encoder.encode(receipt));
        return true;
      } catch (err) {
        logger.error('Print Error:', err);
        throw err;
      } finally {
        try { writer.releaseLock(); } catch (e) {}
      }
    });
  }

  static async printKOT(tableId: string | number, items: OrderItem[], kotNumber: string) {
    const settings = (await Promise.all([db.restaurantProfile.get('global'), db.restaurantSettings.get('global')])).reduce((a,b)=>({...(a||{}), ...(b||{})}), {}) as any;
    const printerMode = settings?.printerMode || 'single';

    if (printerMode === 'multiple') {
      // Split items by printerTarget
      const kitchenItems = items.filter(o => (o.menuItem as any)?.printerTarget !== 'bar');
      const barItems = items.filter(o => (o.menuItem as any)?.printerTarget === 'bar');

      const prints: Promise<boolean>[] = [];

      if (kitchenItems.length > 0) {
        const port = this.kotPort;
        if (!port) throw new Error('Kitchen Printer not connected');
        prints.push(this._printKOTToPort(port, tableId, kitchenItems, kotNumber, settings, 'KITCHEN KOT'));
      }

      if (barItems.length > 0) {
        const port = this.barPort || this.kotPort; // fallback to kitchen if no bar printer
        if (!port) throw new Error('Bar/KOT Printer not connected');
        prints.push(this._printKOTToPort(port, tableId, barItems, kotNumber, settings, 'BAR KOT'));
      }

      if (prints.length === 0) throw new Error('KOT Printer not connected');
      await Promise.all(prints);
      return true;
    } else {
      // Single printer mode: send everything to single/kotPort
      const activePort = this.port || this.kotPort;
      if (!activePort) throw new Error('KOT Printer not connected');
      return this._printKOTToPort(activePort, tableId, items, kotNumber, settings, 'KOT');
    }
  }

  private static async _printKOTToPort(
    activePort: any,
    tableId: string | number,
    items: OrderItem[],
    kotNumber: string,
    settings: any,
    label: string
  ): Promise<boolean> {
    return this.enqueuePort(activePort, async () => {
      if (activePort.writable.locked) {
        await new Promise<void>((resolve, reject) => {
          const startTime = Date.now();
          const check = setInterval(() => {
            if (!activePort.writable.locked) {
              clearInterval(check);
              resolve();
            } else if (Date.now() - startTime > 5000) {
              clearInterval(check);
              reject(new Error('Printer Port Lock Timeout'));
            }
          }, 50);
        });
      }

      const width = settings?.printerWidth || 32;
      const encoder = new TextEncoder();
      const writer = activePort.writable.getWriter();

      try {
        const t = getBillTranslations(settings?.billLanguage);
        let kot = INIT + '\n';
        kot += CENTER + BOLD_ON + DOUBLE_HEIGHT_ON + `${label} \n` + BOLD_OFF + DOUBLE_HEIGHT_OFF;
        const separator = '-'.repeat(width) + '\n';
        kot += separator;
        kot += LEFT + BOLD_ON + `${t.kot.title} No: ${kotNumber}\n` + BOLD_OFF;
        kot += LEFT + `${t.kot.table}: ${tableId}\n`;
        kot += `Time: ${new Date().toLocaleTimeString()}\n`;
        kot += separator;

        const kotNameWidth = width - 5;
        kot += BOLD_ON + t.items.item.padEnd(kotNameWidth) + t.items.qty.padStart(5) + '\n' + BOLD_OFF;

        items.forEach(order => {
          if (!order) return;
          let fullName = order.menuItem?.name || order.name || t.items.unknown;
          let firstLineName = '';
          let remainingName = '';

          if (fullName.length <= kotNameWidth) {
            firstLineName = fullName;
          } else {
            let splitIndex = fullName.lastIndexOf(' ', kotNameWidth);
            if (splitIndex === -1) splitIndex = kotNameWidth;
            firstLineName = fullName.substring(0, splitIndex);
            remainingName = fullName.substring(splitIndex).trim();
          }

          firstLineName = firstLineName.padEnd(kotNameWidth, ' ');
          const qty = (order.quantity || 0).toString().padStart(5, ' ');
          kot += `${firstLineName}${qty}\n`;

          if (remainingName) {
            kot += `${remainingName}\n`;
          }
        });

        kot += separator;
        kot += '\n\n\n' + CUT;

        await writeWithTimeout(writer, encoder.encode(kot));
        return true;
      } catch (err) {
        logger.error('KOT Print Error:', err);
        throw err;
      } finally {
        try { writer.releaseLock(); } catch (e) {}
      }
    });
  }

  static async printCancelKOT(tableId: string | number, kotNumber: string, items: OrderItem[]) {
    const settings = (await Promise.all([db.restaurantProfile.get('global'), db.restaurantSettings.get('global')])).reduce((a,b)=>({...(a||{}), ...(b||{})}), {}) as any;
    const printerMode = settings?.printerMode || 'single';

    if (printerMode === 'multiple') {
      const kitchenItems = items.filter(o => (o.menuItem as any)?.printerTarget !== 'bar');
      const barItems = items.filter(o => (o.menuItem as any)?.printerTarget === 'bar');

      const prints: Promise<boolean>[] = [];

      if (kitchenItems.length > 0) {
        const port = this.kotPort;
        if (port) prints.push(this._printCancelKOTToPort(port, tableId, kitchenItems, kotNumber, settings));
      }

      if (barItems.length > 0) {
        const port = this.barPort || this.kotPort;
        if (port) prints.push(this._printCancelKOTToPort(port, tableId, barItems, kotNumber, settings));
      }

      if (prints.length === 0) throw new Error('KOT Printer not connected');
      await Promise.all(prints);
      return true;
    } else {
      const activePort = this.port || this.kotPort;
      if (!activePort) throw new Error('KOT Printer not connected');
      return this._printCancelKOTToPort(activePort, tableId, items, kotNumber, settings);
    }
  }

  private static async _printCancelKOTToPort(
    activePort: any,
    tableId: string | number,
    items: OrderItem[],
    kotNumber: string,
    settings: any
  ): Promise<boolean> {
    return this.enqueuePort(activePort, async () => {
      if (activePort.writable.locked) {
        await new Promise<void>((resolve, reject) => {
          const startTime = Date.now();
          const check = setInterval(() => {
            if (!activePort.writable.locked) {
              clearInterval(check);
              resolve();
            } else if (Date.now() - startTime > 5000) {
              clearInterval(check);
              reject(new Error('Printer Port Lock Timeout'));
            }
          }, 50);
        });
      }

      const width = settings?.printerWidth || 32;
      const encoder = new TextEncoder();
      const writer = activePort.writable.getWriter();

      try {
        const t = getBillTranslations(settings?.billLanguage);
        let kot = INIT + '\n';
        kot += CENTER + BOLD_ON + DOUBLE_HW_ON + `${t.kot.title} CANCELLED\n` + BOLD_OFF + DOUBLE_HEIGHT_OFF;
        const separator = '-'.repeat(width) + '\n';
        kot += separator;
        kot += LEFT + BOLD_ON + `${t.kot.title} No: ${kotNumber} [CANCEL]\n` + BOLD_OFF;
        kot += LEFT + `${t.kot.table}: ${tableId}\n`;
        kot += `Time: ${new Date().toLocaleTimeString()}\n`;
        kot += separator;

        const kotNameWidth = width - 5;
        kot += BOLD_ON + t.items.item.padEnd(kotNameWidth) + t.items.qty.padStart(5) + '\n' + BOLD_OFF;

        items.forEach(order => {
          if (!order) return;
          let fullName = order.menuItem?.name || order.name || t.items.unknown;
          let firstLineName = '';
          let remainingName = '';

          if (fullName.length <= kotNameWidth) {
            firstLineName = fullName;
          } else {
            let splitIndex = fullName.lastIndexOf(' ', kotNameWidth);
            if (splitIndex === -1) splitIndex = kotNameWidth;
            firstLineName = fullName.substring(0, splitIndex);
            remainingName = fullName.substring(splitIndex).trim();
          }

          firstLineName = firstLineName.padEnd(kotNameWidth, ' ');
          const qty = (order.quantity || 0).toString().padStart(5, ' ');
          kot += `${firstLineName}${qty}\n`;

          if (remainingName) {
            kot += `${remainingName}\n`;
          }
        });

        kot += separator;
        kot += CENTER + BOLD_ON + '*** STOP PREPARATION ***\n' + BOLD_OFF;
        kot += separator;
        kot += '\n\n\n' + CUT;

        await writeWithTimeout(writer, encoder.encode(kot));
        return true;
      } catch (err) {
        logger.error('Cancel KOT Print Error:', err);
        throw err;
      } finally {
        try { writer.releaseLock(); } catch (e) {}
      }
    });
  }

  static async printClosingReport(closingData: any, settings: any) {
    const printerMode = settings?.printerMode || 'single';
    const activePort = printerMode === 'multiple' ? this.receiptPort : (this.port || this.receiptPort);
    if (!activePort) throw new Error('Receipt Printer not connected');

    return this.enqueuePort(activePort, async () => {
      // Wait for any pending write on this port to finish
      if (activePort.writable.locked) {
        await new Promise<void>((resolve, reject) => {
          const startTime = Date.now();
          const check = setInterval(() => {
            if (!activePort.writable.locked) {
              clearInterval(check);
              resolve();
            } else if (Date.now() - startTime > 5000) {
              clearInterval(check);
              reject(new Error('Printer Port Lock Timeout'));
            }
          }, 50);
        });
      }

      const width = settings?.printerWidth || 32;
      const encoder = new TextEncoder();
      const writer = activePort.writable.getWriter();

      try {
        let report = INIT + '\n';
        
        const restaurantName = (settings?.restaurantName || 'RESTAURANT POS').toUpperCase();
        report += CENTER + BOLD_ON + DOUBLE_HEIGHT_ON + 'DAILY CLOSING\n' + BOLD_OFF + DOUBLE_HEIGHT_OFF;
        report += CENTER + BOLD_ON + 'REPORT\n' + BOLD_OFF;
        report += CENTER + `${restaurantName}\n`;
        
        const separator = '-'.repeat(width) + '\n';
        report += separator;
        
        report += LEFT + BOLD_ON + `Date: ${closingData.date}\n` + BOLD_OFF;
        report += `Printed At: ${new Date().toLocaleTimeString()}\n`;
        report += separator;
        
        // Sales Summary
        report += LEFT + BOLD_ON + '--- SALES SUMMARY ---\n' + BOLD_OFF;
        report += `Total Orders: ${closingData.totalOrders}\n`;
        report += `Subtotal    : Rs ${closingData.subtotal.toFixed(2)}\n`;
        report += `Discount (-) : Rs ${closingData.discount.toFixed(2)}\n`;
        report += `GST Tax  (+) : Rs ${closingData.tax.toFixed(2)}\n`;
        report += BOLD_ON + `GROSS SALES  : Rs ${(closingData.totalSales + (closingData.paymentBreakdown.Credit || 0)).toFixed(2)}\n` + BOLD_OFF;
        report += separator;
        
        // Payments Breakdown
        report += LEFT + BOLD_ON + '--- PAYMENT METHOD ---\n' + BOLD_OFF;
        report += `Cash Total  : Rs ${(closingData.paymentBreakdown.Cash || 0).toFixed(2)}\n`;
        report += `UPI Total   : Rs ${(closingData.paymentBreakdown.UPI || 0).toFixed(2)}\n`;
        report += `Card Total  : Rs ${(closingData.paymentBreakdown.Card || 0).toFixed(2)}\n`;
        report += `Credit (Udh): Rs ${(closingData.paymentBreakdown.Credit || 0).toFixed(2)}\n`;
        report += `Unpaid Total: Rs ${(closingData.paymentBreakdown.Unpaid || 0).toFixed(2)}\n`;
        report += BOLD_ON + `NET SALES   : Rs ${closingData.totalSales.toFixed(2)}\n` + BOLD_OFF;
        report += separator;
        
        // Expenses and Profit
        report += LEFT + BOLD_ON + '--- EXPENSES & PROFIT ---\n' + BOLD_OFF;
        report += `Total Expenses: Rs ${closingData.totalExpenses.toFixed(2)}\n`;
        
        const cashInHand = Math.max(0, (closingData.paymentBreakdown.Cash || 0) - closingData.totalExpenses);
        report += `Cash In Hand  : Rs ${cashInHand.toFixed(2)}\n`;
        
        report += separator;
        report += CENTER + BOLD_ON + DOUBLE_HEIGHT_ON + `NET PROFIT: Rs ${closingData.netProfit.toFixed(2)}\n` + BOLD_OFF + DOUBLE_HEIGHT_OFF;
        report += separator;
        
        report += CENTER + 'End of Daily Closing Report\n';
        report += '\n\n\n' + CUT;

        await writeWithTimeout(writer, encoder.encode(report));
        return true;
      } catch (err) {
        logger.error('Closing Report Print Error:', err);
        throw err;
      } finally {
        try { writer.releaseLock(); } catch (e) {}
      }
    });
  }

  static async printKhataStatement(customer: any, transactions: any[], settings: any) {
    const printerMode = settings?.printerMode || 'single';
    const activePort = printerMode === 'multiple' ? this.receiptPort : (this.port || this.receiptPort);
    if (!activePort) throw new Error('Printer not connected');

    return this.enqueuePort(activePort, async () => {
      if (activePort.writable.locked) {
        await new Promise<void>((resolve, reject) => {
          const startTime = Date.now();
          const check = setInterval(() => {
            if (!activePort.writable.locked) {
              clearInterval(check);
              resolve();
            } else if (Date.now() - startTime > 5000) {
              clearInterval(check);
              reject(new Error('Printer Port Lock Timeout'));
            }
          }, 50);
        });
      }

      const width = settings?.printerWidth || 32;
      const encoder = new TextEncoder();
      const writer = activePort.writable.getWriter();

      try {
        let print = INIT + '\n';
        print += CENTER + BOLD_ON + DOUBLE_HEIGHT_ON + 'KHATA STATEMENT\n' + BOLD_OFF + DOUBLE_HEIGHT_OFF;
        print += CENTER + `${(settings?.restaurantName || 'RESTAURANT POS').toUpperCase()}\n`;
        const separator = '-'.repeat(width) + '\n';
        print += separator;
        print += LEFT + `Customer: ${customer.name}\n`;
        print += `Phone   : ${customer.phone}\n`;
        print += `Date    : ${new Date().toLocaleDateString()}\n`;
        print += separator;
        
        print += CENTER + BOLD_ON + DOUBLE_HEIGHT_ON + `BALANCE: Rs ${customer.balance.toFixed(2)}\n` + BOLD_OFF + DOUBLE_HEIGHT_OFF;
        print += separator;

        print += LEFT + 'Transaction History:\n';
        const chronologicalTransactions = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
        
        // Fetch all bills for the customer to check settlement status
        let bills: any[] = [];
        if (customer.phone) {
          try {
            bills = await db.bills.where('customerPhone').equals(customer.phone).toArray();
          } catch (e) {
            logger.error('Error fetching bills for customer statement:', e);
          }
        }

        const getCreditAmountForBill = (bill: any): number => {
          if (!bill.paymentMethod) return 0;
          if (bill.paymentMethod === 'Credit' || bill.paymentMethod === 'Udhar' || bill.paymentMethod === 'Unpaid') {
            return bill.total;
          }
          if (bill.paymentMethod.startsWith('Split')) {
            const creditMatch = bill.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);
            if (creditMatch && creditMatch[1]) {
              return parseFloat(creditMatch[1]);
            }
          }
          return 0;
        };

        chronologicalTransactions.forEach(t => {
          if (t.type !== 'credit') return; // Do not print payment/repayment transactions
          
          let amt = t.amount;
          if (t.relatedBillId) {
            const bill = bills.find(b => b.id === t.relatedBillId);
            if (bill) {
              const outstandingAmt = getCreditAmountForBill(bill);
              if (outstandingAmt <= 0) {
                return; // Skip fully settled bills
              }
              amt = outstandingAmt; // Show remaining unpaid portion
            }
          }

          const date = new Date(t.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
          const type = 'Debt';
          const amtStr = amt.toFixed(2).padStart(6);
          print += `${date} - ${type}: Rs ${amtStr}\n`;
        });
        print += separator;
        print += CENTER + 'Please settle pending balance.\n*** Thank You ***\n\n\n\n' + CUT;

        await writeWithTimeout(writer, encoder.encode(print));
        return true;
      } catch (err) {
        logger.error('Khata Statement Print Error:', err);
        throw err;
      } finally {
        try { writer.releaseLock(); } catch (e) {}
      }
    });
  }
}

