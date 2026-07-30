// ESC/POS Commands & Formatting Helpers

export const ESC = '\x1B';
export const GS = '\x1D';
export const INIT = ESC + '@'; // Initialize printer
export const BOLD_ON = ESC + 'E' + '\x01';
export const BOLD_OFF = ESC + 'E' + '\x00';
export const CENTER = ESC + 'a' + '\x01';
export const LEFT = ESC + 'a' + '\x00';
export const RIGHT = ESC + 'a' + '\x02';
export const CUT = GS + 'V' + '\x41' + '\x10'; // Partial cut
export const DOUBLE_HEIGHT_ON = ESC + '!' + '\x10';
export const DOUBLE_HW_ON = ESC + '!' + '\x30'; // Double Height + Double Width
export const DOUBLE_HEIGHT_OFF = ESC + '!' + '\x00';

// Serial write with timeout to prevent port hangs
export const writeWithTimeout = (
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
