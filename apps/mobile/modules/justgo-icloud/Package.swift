// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "JustGoICloud",
  platforms: [.macOS(.v13), .iOS("16.4")],
  targets: [
    .target(
      name: "JustGoICloud",
      path: "ios",
      exclude: ["JustGoICloudModule.swift", "JustGoICloud.podspec"]
    ),
    .testTarget(name: "JustGoICloudTests", dependencies: ["JustGoICloud"])
  ]
)
