Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\khana\.gemini\antigravity-ide\brain\5e6c04c2-9bf9-4ea7-a5da-a06da8ae1f1e\media__1786634822911.jpg"
$destBuildDir = "d:\Project\siya bill\build"
$destPublicDir = "d:\Project\siya bill\public"

if (-not (Test-Path $destBuildDir)) {
    New-Item -ItemType Directory -Path $destBuildDir -Force
}
if (-not (Test-Path $destPublicDir)) {
    New-Item -ItemType Directory -Path $destPublicDir -Force
}

$srcImg = [System.Drawing.Image]::FromFile($sourcePath)
Write-Host "Source image dimensions: $($srcImg.Width)x$($srcImg.Height)"

function Resize-Image {
    param(
        [System.Drawing.Image]$Image,
        [int]$Width,
        [int]$Height
    )
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
    $destImage = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $destImage.SetResolution($Image.HorizontalResolution, $Image.VerticalResolution)

    $graphics = [System.Drawing.Graphics]::FromImage($destImage)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $wrapMode = New-Object System.Drawing.Imaging.ImageAttributes
    $wrapMode.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $graphics.DrawImage($Image, $destRect, 0, 0, $Image.Width, $Image.Height, [System.Drawing.GraphicsUnit]::Pixel, $wrapMode)
    $graphics.Dispose()
    $wrapMode.Dispose()

    return $destImage
}

# 1. Generate full-res 1024x1024 / 512x512 PNGs
$png1024 = Resize-Image -Image $srcImg -Width 1024 -Height 1024
$png1024.Save("$destBuildDir\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$png1024.Save("$destPublicDir\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$png1024.Dispose()

# 2. Prepare multi-resolution PNG buffers for ICO file (256, 128, 64, 48, 32, 16)
$sizes = @(256, 128, 64, 48, 32, 16)
$iconBuffers = @()

foreach ($size in $sizes) {
    $resized = Resize-Image -Image $srcImg -Width $size -Height $size
    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $resized.Dispose()
    $ms.Dispose()
    
    $iconBuffers += [PSCustomObject]@{
        Width = $size
        Height = $size
        Bytes = $bytes
    }
}

$srcImg.Dispose()

function Save-IcoFile {
    param(
        [string]$FilePath,
        [array]$Images
    )
    $fs = [System.IO.File]::Create($FilePath)
    $bw = New-Object System.IO.BinaryWriter($fs)

    # ICONDIR structure (6 bytes)
    $bw.Write([uint16]0) # Reserved, must be 0
    $bw.Write([uint16]1) # Resource type (1 for icon)
    $bw.Write([uint16]$Images.Count) # Number of images

    # Offset to image data: 6 (ICONDIR) + Count * 16 (ICONDIRENTRY)
    $offset = 6 + ($Images.Count * 16)

    # Write ICONDIRENTRY for each image
    foreach ($img in $Images) {
        $w = if ($img.Width -ge 256) { [byte]0 } else { [byte]$img.Width }
        $h = if ($img.Height -ge 256) { [byte]0 } else { [byte]$img.Height }
        $bw.Write($w) # Width
        $bw.Write($h) # Height
        $bw.Write([byte]0) # Color palette count (0 for >= 8bpp)
        $bw.Write([byte]0) # Reserved
        $bw.Write([uint16]1) # Color planes
        $bw.Write([uint16]32) # Bits per pixel
        $bw.Write([uint32]$img.Bytes.Length) # Image size in bytes
        $bw.Write([uint32]$offset) # Image offset
        $offset += $img.Bytes.Length
    }

    # Write PNG image data for each frame
    foreach ($img in $Images) {
        $bw.Write($img.Bytes)
    }

    $bw.Flush()
    $bw.Close()
    $fs.Close()
}

Save-IcoFile -FilePath "$destBuildDir\icon.ico" -Images $iconBuffers
Save-IcoFile -FilePath "$destPublicDir\favicon.ico" -Images $iconBuffers

Write-Host "Successfully generated all icons:"
Write-Host " - $destBuildDir\icon.png"
Write-Host " - $destPublicDir\icon.png"
Write-Host " - $destBuildDir\icon.ico"
Write-Host " - $destPublicDir\favicon.ico"
