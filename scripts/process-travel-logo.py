#!/usr/bin/env python3
"""
Process travel-bandeja logo:
- Remove black background -> transparent (via Replicate if token present, else local PIL)
- Remove Gemini star (small 4-point sparkle bottom-right)
- Trim transparent border and save as travel-bandeja-logo-tr.png

Usage:
  python3 scripts/process-travel-logo.py --input /path/to/source.png [--output Frontend/public/travel-bandeja-logo-tr.png]
  If --input not given, looks for tmp/travel-source.png, ./travel-bandeja-logo.png, /tmp/input.png, etc.

Replicate:
  If env REPLICATE_API_TOKEN is set, uses replicate model `cjwbw/rembg` (or `lucataco/remove-bg`)
  Fallback is local PIL thresholding (black -> transparent) which works well for this solid-black background.
"""
import argparse
import os
import sys
from pathlib import Path

VENV_PYTHON = "/tmp/pyvenv/bin/python"

def try_replicate_remove_bg(input_path: Path) -> Path | None:
    """Try to use Replicate API to remove background. Returns path to output if success, else None."""
    token = os.environ.get("REPLICATE_API_TOKEN") or os.environ.get("REPLICATE_API_KEY")
    if not token:
        return None
    try:
        import replicate
    except ImportError:
        print("[replicate] replicate package not installed, skipping", file=sys.stderr)
        return None

    # Common replicate background removal models:
    # - cjwbw/rembg: https://replicate.com/cjwbw/rembg
    # - lucataco/remove-bg
    # Try cjwbw/rembg first
    models_to_try = [
        "cjwbw/rembg",
        "lucataco/remove-bg",
        "adirik/remove-background",
    ]
    for model in models_to_try:
        try:
            print(f"[replicate] Trying model {model} ...", file=sys.stderr)
            with open(input_path, "rb") as f:
                output = replicate.run(model, input={"image": f})
            # output is usually a URL string or file-like
            # Handle different return types
            import urllib.request
            url = None
            if isinstance(output, str) and output.startswith("http"):
                url = output
            elif isinstance(output, list) and len(output) > 0 and isinstance(output[0], str):
                url = output[0]
            elif hasattr(output, "url"):
                url = output.url  # type: ignore
            else:
                print(f"[replicate] Unexpected output type from {model}: {type(output)} {output}", file=sys.stderr)
                continue

            if url:
                tmp_out = Path("/tmp/replicate_bg_removed.png")
                urllib.request.urlretrieve(url, tmp_out)
                print(f"[replicate] Got result from {model} -> {tmp_out}", file=sys.stderr)
                return tmp_out
        except Exception as e:
            print(f"[replicate] model {model} failed: {e}", file=sys.stderr)
            continue
    return None


def local_remove_bg_and_star(input_path: Path, output_path: Path):
    """Local PIL: black -> transparent, remove Gemini star, trim."""
    from PIL import Image

    im = Image.open(input_path).convert("RGBA")
    width, height = im.size
    print(f"[local] Input {input_path} size {width}x{height} mode {im.mode}", file=sys.stderr)

    pix = im.load()

    # Step 1: Black background -> transparent
    # Treat near-black (R+G+B < 30 and max(R,G,B) < 25) as background
    # Use threshold with anti-alias smoothing: compute alpha from luminance
    # For pure black background this is clean; for halftone whites we keep opaque.
    for y in range(height):
        for x in range(width):
            r, g, b, a = pix[x, y]
            # Keep already transparent
            if a == 0:
                continue
            luminance = (r + g + b) / 3
            maxc = max(r, g, b)
            # Strict black background
            if maxc < 20 and luminance < 18:
                pix[x, y] = (0, 0, 0, 0)
            elif maxc < 40 and luminance < 35:
                # Anti-aliased edge of black -> partial transparency
                # Map luminance 0-35 to alpha 0-255 (more aggressive)
                # Keep edge smoothing
                alpha = int(255 * (luminance / 35))
                # If pixel is very dark but not pure black, make semi-transparent
                # Only if it's dark enough to be background fringe
                if alpha < 128:
                    pix[x, y] = (r, g, b, alpha)
                else:
                    # Keep but reduce alpha slightly for smoothing
                    pass
            # else keep opaque

    # Step 2: Remove Gemini star (bottom-right corner sparkle)
    # It's a small diamond ~ 30-50px in bottom-right, gray (70,70,70) to light gray on black
    # After step 1, black is transparent, but the star sits on black so it remains as
    # a small isolated opaque cluster in the corner. We remove any opaque pixels in a
    # corner region that are far from the main tiger art.

    # Estimate corner region: last 6% width and last 12% height
    # For a typical 2000px wide image, that's ~120px square in bottom-right.
    cx0 = int(width * 0.88)
    cy0 = int(height * 0.78)
    # Scan this corner region for isolated clusters
    # Simple approach: any opaque pixel in this region that is not connected to main art
    # Since main art extends to about 91% width (tiger tail tip), the star at ~96% width is isolated.
    # We'll do flood-fill isolation check: if we find opaque pixels near the extreme corner,
    # remove them.

    # Find bounding box of main art to know where tiger ends
    # Scan from right edge inward to find first opaque pixel of main art
    rightmost_main = 0
    for x in range(width - 1, -1, -1):
        col_has_opaque = any(pix[x, y][3] > 10 for y in range(height))
        if col_has_opaque:
            rightmost_main = x
            break

    # Star is typically within 40px of bottom-right corner, isolated gap > 30px from main art
    # So if rightmost_main is at least 30px away from the star cluster, we can safely clear corner.
    # Just clear a 6% corner box if it's isolated.

    # More robust: clear any opaque pixels in the extreme corner 4% region
    # plus a slightly larger 8% region if they form a small cluster (< 2500 px)

    # Robust star removal: look for small isolated clusters in bottom-right 20% region
    # The Gemini star is a small diamond (~300-4000px) isolated from the main tiger art.
    # Original detection at 92% missed stars at ~90% (real file star at 90.7% width, 85% height).
    # Use a wider search: 85% width, 80% height, and use connected-component analysis
    # to remove only small isolated clusters (<5000px) that are not the main art.

    # First, quick check: count in wider corner 85%/80%
    rx0_wide = int(width * 0.85)
    ry0_wide = int(height * 0.80)
    count_wide = 0
    for y in range(ry0_wide, height):
        for x in range(rx0_wide, width):
            if pix[x, y][3] > 10:
                count_wide += 1

    # Also count in original narrow corner for logging
    rx0 = int(width * 0.92)
    ry0 = int(height * 0.88)
    count_corner = 0
    for y in range(ry0, height):
        for x in range(rx0, width):
            if pix[x, y][3] > 10:
                count_corner += 1

    # If we have a small isolated cluster in the wide corner, do precise removal
    # Use BFS to find all clusters in the wide corner region and remove small ones
    # that are far from the main art (tiger)
    if count_wide > 0 and count_wide < 20000:
        # Find all clusters in the wide corner region
        visited = set()
        clusters_to_remove = []
        for y in range(ry0_wide, height):
            for x in range(rx0_wide, width):
                if (x, y) in visited:
                    continue
                if pix[x, y][3] <= 10:
                    continue
                # BFS cluster
                stack = [(x, y)]
                cluster = []
                visited.add((x, y))
                while stack:
                    cx, cy = stack.pop()
                    cluster.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if rx0_wide <= nx < width and ry0_wide <= ny < height and (nx, ny) not in visited:
                                if pix[nx, ny][3] > 10:
                                    visited.add((nx, ny))
                                    stack.append((nx, ny))
                # Keep only small isolated clusters (<5000px) - star is ~300-4000px
                # Main tiger in this region would be much larger (>10000px) if it extends there
                if len(cluster) < 5000:
                    # Additional check: star is near the bottom edge, not in the middle
                    ys = [yy for _, yy in cluster]
                    xs = [xx for xx, _ in cluster]
                    # Star is typically in the bottom 25% of the image
                    if max(ys) > height * 0.85 and min(xs) > width * 0.88:
                        clusters_to_remove.append(cluster)
                    elif len(cluster) < 1000 and max(ys) > height * 0.80:
                        # Very small cluster anywhere in bottom region is likely star
                        clusters_to_remove.append(cluster)

        # Also check for star slightly more central (like real file at 90.7% width, 85% height)
        # Expand search to 0.75 height if needed
        if not clusters_to_remove:
            # Try even wider search for star at 90% width
            rx0 = int(width * 0.88)
            ry0 = int(height * 0.75)
            # Re-scan with wider Y
            visited2 = set()
            for y in range(ry0, height):
                for x in range(rx0, width):
                    if (x, y) in visited2:
                        continue
                    if pix[x, y][3] <= 10:
                        continue
                    stack = [(x, y)]
                    cluster = []
                    visited2.add((x, y))
                    while stack:
                        cx, cy = stack.pop()
                        cluster.append((cx, cy))
                        for dx in (-1, 0, 1):
                            for dy in (-1, 0, 1):
                                nx, ny = cx + dx, cy + dy
                                if rx0 <= nx < width and ry0 <= ny < height and (nx, ny) not in visited2:
                                    if pix[nx, ny][3] > 10:
                                        visited2.add((nx, ny))
                                        stack.append((nx, ny))
                    if 100 < len(cluster) < 5000:
                        # Check isolation from main art: look for gap to left
                        min_x = min(xx for xx, _ in cluster)
                        # If there's a transparent gap of >20px to the left, it's isolated star
                        has_gap = True
                        for check_x in range(min_x - 30, min_x - 5):
                            if check_x < rx0:
                                continue
                            for check_y in range(min(yy for _, yy in cluster), max(yy for _, yy in cluster) + 1):
                                if 0 <= check_y < height and pix[check_x, check_y][3] > 10:
                                    has_gap = False
                                    break
                            if not has_gap:
                                break
                        if has_gap:
                            clusters_to_remove.append(cluster)

        if clusters_to_remove:
            total_cleared = 0
            for cluster in clusters_to_remove:
                for (cx, cy) in cluster:
                    pix[cx, cy] = (0, 0, 0, 0)
                    total_cleared += 1
            print(f"[local] Cleared {len(clusters_to_remove)} star cluster(s) total {total_cleared} pixels (wide count {count_wide}, corner {count_corner})", file=sys.stderr)
        else:
            # Fallback: old logic for extreme corner star (chat image style)
            if count_corner > 0 and count_corner < 5000:
                clear_x0 = int(width * 0.94)
                clear_y0 = int(height * 0.85)
                cleared = 0
                for y in range(clear_y0, height):
                    for x in range(clear_x0, width):
                        if pix[x, y][3] > 10:
                            pix[x, y] = (0, 0, 0, 0)
                            cleared += 1
                print(f"[local] Fallback cleared Gemini star region {cleared} pixels (corner count {count_corner})", file=sys.stderr)

        second_cleared = 0
        for y in range(int(height * 0.88), height):
            for x in range(int(width * 0.90), int(width * 0.94)):
                if pix[x, y][3] > 10:
                    # Check if this pixel is isolated: look at 20px left - if no opaque main art, it's star
                    left_has = any(pix[max(0, x - dx), y][3] > 10 for dx in range(20, 60))
                    # Actually check horizontal gap: scan left 30px for any opaque
                    gap = True
                    for dx in range(1, 40):
                        if x - dx >= 0 and pix[x - dx, y][3] > 10:
                            # Found nearby opaque, likely connected to tail
                            gap = False
                            break
                    # If isolated horizontally and vertically small, clear
                    if gap:
                        # Also check vertical isolation not needed, just clear small isolated pixels
                        pix[x, y] = (0, 0, 0, 0)
                        second_cleared += 1
        if second_cleared:
            print(f"[local] Cleared secondary star fringe {second_cleared} pixels", file=sys.stderr)

    else:
        print(f"[local] Corner pixel count {count_corner} (no star clear, probably no star or large art)", file=sys.stderr)

    # Step 3: Trim transparent border (crop to content + padding)
    # Find bounding box of non-transparent pixels
    bbox = im.getbbox()  # Uses alpha channel for RGBA
    if bbox:
        # Add padding: 4px or 0.5% of size
        pad = max(4, int(min(width, height) * 0.005))
        x0, y0, x1, y1 = bbox
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(width, x1 + pad)
        y1 = min(height, y1 + pad)
        im_cropped = im.crop((x0, y0, x1, y1))
        print(f"[local] Cropped {width}x{height} -> {im_cropped.size} bbox {bbox} pad {pad}", file=sys.stderr)
        im = im_cropped
    else:
        print("[local] No bbox found, keeping full size", file=sys.stderr)

    # Ensure output dir exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    im.save(output_path, "PNG", optimize=True)
    print(f"[local] Saved {output_path} {im.size} {len(im.tobytes())} bytes", file=sys.stderr)
    return output_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", "-i", type=str, default=None, help="Input PNG path")
    parser.add_argument("--output", "-o", type=str, default="Frontend/public/travel-bandeja-logo-tr.png", help="Output PNG path")
    parser.add_argument("--no-replicate", action="store_true", help="Skip Replicate, use local only")
    args = parser.parse_args()

    # Resolve input candidates
    candidates = []
    if args.input:
        candidates.append(Path(args.input))
    candidates.extend([
        Path("tmp/travel-source.png"),
        Path("tmp/input.png"),
        Path("/tmp/travel-source.png"),
        Path("/tmp/input.png"),
        Path("travel-bandeja-logo.png"),
        Path("Frontend/public/travel-bandeja-logo.png"),
        Path("./travel-bandeja-logo-tr.png"),  # maybe already there
    ])

    input_path = None
    for p in candidates:
        if p.exists():
            input_path = p
            break

    if not input_path:
        print("No input file found. Tried:", file=sys.stderr)
        for p in candidates:
            print(f"  - {p} {'(exists)' if p.exists() else '(missing)'}", file=sys.stderr)
        print("\nPlease place your source PNG at one of:", file=sys.stderr)
        print("  tmp/travel-source.png  (recommended)", file=sys.stderr)
        print("or run with --input /path/to/your.png", file=sys.stderr)
        print("\nExample:", file=sys.stderr)
        print("  /tmp/pyvenv/bin/python scripts/process-travel-logo.py --input ~/Downloads/your-image.png", file=sys.stderr)
        sys.exit(2)

    output_path = Path(args.output)

    # Try Replicate first (if not disabled)
    interim = None
    if not args.no_replicate:
        try:
            replicate_out = try_replicate_remove_bg(input_path)
            if replicate_out:
                interim = replicate_out
                # Replicate already removed background, but star may remain
                # Run local star removal + trim on replicate output
                print(f"[main] Replicate succeeded, post-processing star removal on {replicate_out}", file=sys.stderr)
                local_remove_bg_and_star(replicate_out, output_path)
                print(f"Done (via Replicate+local): {output_path}")
                return
            else:
                print("[main] Replicate not used or failed, falling back to local", file=sys.stderr)
        except Exception as e:
            print(f"[main] Replicate error: {e}, falling back to local", file=sys.stderr)

    # Local fallback
    local_remove_bg_and_star(input_path, output_path)
    print(f"Done (via local): {output_path}")

    # Also copy to alternative locations for convenience
    alt_paths = [
        Path("travel-bandeja-logo-tr.png"),
        Path("Frontend/dist/travel-bandeja-logo-tr.png"),
    ]
    for alt in alt_paths:
        try:
            if alt != output_path:
                alt.parent.mkdir(parents=True, exist_ok=True)
                import shutil
                shutil.copy2(output_path, alt)
                print(f"Also copied to {alt}", file=sys.stderr)
        except Exception as e:
            print(f"Skip alt {alt}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
