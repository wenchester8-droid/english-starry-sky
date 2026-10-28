// 用 macOS 自带的 Vision 框架识别图片里的中英文，每张图输出一段文字。
// 用法: swift ocr.swift 图片1.png 图片2.png ...
import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
    guard let image = NSImage(contentsOfFile: path),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        print("===== \(path)\n[无法读取图片]")
        continue
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US", "zh-Hans"]
    request.usesLanguageCorrection = true
    try? VNImageRequestHandler(cgImage: cg).perform([request])
    let lines = (request.results ?? [])
        .compactMap { obs -> (CGRect, String)? in
            guard let t = obs.topCandidates(1).first?.string else { return nil }
            return (obs.boundingBox, t)
        }
    // 按行从上到下；同一行（选项并排）再从左到右
    let sorted = lines.sorted { a, b in
        if abs(a.0.midY - b.0.midY) > 0.006 { return a.0.midY > b.0.midY }
        return a.0.minX < b.0.minX
    }
    print("===== \(path)")
    for (_, t) in sorted { print(t) }
}
