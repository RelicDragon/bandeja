// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BandejaWatchShared",
    platforms: [
        .iOS(.v16),
        .watchOS(.v10),
    ],
    products: [
        .library(
            name: "BandejaWatchShared",
            targets: ["BandejaWatchShared"]
        ),
    ],
    targets: [
        .target(name: "BandejaWatchShared"),
        .testTarget(
            name: "BandejaWatchSharedTests",
            dependencies: ["BandejaWatchShared"]
        ),
    ]
)
