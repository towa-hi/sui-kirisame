import AppKit
import CoreImage
import Foundation

let destination = "https://kirisame-dapp.onrender.com/"
let componentAllowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")
let slushURL = "https://my.slush.app/browse/" + destination.addingPercentEncoding(withAllowedCharacters: componentAllowed)!
let outputURL = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "assets/kirisame-slush-thumbnail.png")

guard
    let data = slushURL.data(using: .utf8),
    let filter = CIFilter(name: "CIQRCodeGenerator")
else {
    fatalError("Could not initialize the QR generator")
}

filter.setValue(data, forKey: "inputMessage")
filter.setValue("Q", forKey: "inputCorrectionLevel")
guard let qrImage = filter.outputImage else {
    fatalError("Could not generate the QR code")
}

let canvasSize = NSSize(width: 1200, height: 1200)
let image = NSImage(size: canvasSize)
image.lockFocus()

let background = NSColor(calibratedRed: 0.055, green: 0.18, blue: 0.15, alpha: 1)
background.setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: canvasSize)).fill()

let rainColor = NSColor(calibratedRed: 0.34, green: 0.63, blue: 0.56, alpha: 0.22)
rainColor.setStroke()
for x in stride(from: 36.0, through: 1180.0, by: 72.0) {
    let path = NSBezierPath()
    path.lineWidth = 7
    path.lineCapStyle = .round
    path.move(to: NSPoint(x: x, y: 1060))
    path.line(to: NSPoint(x: x - 24, y: 1016))
    path.stroke()
}

let centered = NSMutableParagraphStyle()
centered.alignment = .center

let eyebrow = "KIRISAME"
eyebrow.draw(
    in: NSRect(x: 100, y: 1060, width: 1000, height: 70),
    withAttributes: [
        .font: NSFont.systemFont(ofSize: 38, weight: .semibold),
        .foregroundColor: NSColor(calibratedWhite: 0.98, alpha: 1),
        .kern: 12,
        .paragraphStyle: centered,
    ]
)

let title = "Open in Slush"
title.draw(
    in: NSRect(x: 100, y: 960, width: 1000, height: 90),
    withAttributes: [
        .font: NSFont.systemFont(ofSize: 68, weight: .bold),
        .foregroundColor: NSColor(calibratedWhite: 1, alpha: 1),
        .paragraphStyle: centered,
    ]
)

let cardRect = NSRect(x: 150, y: 150, width: 900, height: 780)
NSColor.white.setFill()
NSBezierPath(roundedRect: cardRect, xRadius: 52, yRadius: 52).fill()

let context = CIContext(options: [.useSoftwareRenderer: false])
let scale = floor(700 / qrImage.extent.width)
let scaledQR = qrImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
guard let qrCGImage = context.createCGImage(scaledQR, from: scaledQR.extent) else {
    fatalError("Could not render the QR code")
}

let qrNSImage = NSImage(cgImage: qrCGImage, size: NSSize(width: scaledQR.extent.width, height: scaledQR.extent.height))
let qrRect = NSRect(
    x: (canvasSize.width - 700) / 2,
    y: 215,
    width: 700,
    height: 700
)
qrNSImage.draw(in: qrRect, from: .zero, operation: .copy, fraction: 1, respectFlipped: false, hints: [.interpolation: NSImageInterpolation.none])

let instruction = "SCAN WITH YOUR PHONE CAMERA"
instruction.draw(
    in: NSRect(x: 175, y: 165, width: 850, height: 38),
    withAttributes: [
        .font: NSFont.systemFont(ofSize: 23, weight: .medium),
        .foregroundColor: NSColor(calibratedRed: 0.055, green: 0.18, blue: 0.15, alpha: 1),
        .kern: 3,
        .paragraphStyle: centered,
    ]
)

image.unlockFocus()

guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
else {
    fatalError("Could not encode the thumbnail")
}

try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
try png.write(to: outputURL)
print("Wrote \(outputURL.path)")
print("Encoded \(slushURL)")
