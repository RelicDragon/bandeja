// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BandejaNextGames",
    platforms: [
        .iOS(.v16),
        .watchOS(.v10),
    ],
    products: [
        .library(
            name: "BandejaNextGames",
            targets: ["BandejaNextGames"]
        ),
    ],
    targets: [
        .target(name: "BandejaNextGames"),
        .testTarget(
            name: "BandejaNextGamesTests",
            dependencies: ["BandejaNextGames"]
        ),
    ]
)
