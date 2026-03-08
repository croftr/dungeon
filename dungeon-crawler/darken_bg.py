from PIL import Image

def get_neighbors(x, y, w, h):
    neighbors = []
    if x > 0: neighbors.append((x-1, y))
    if x < w - 1: neighbors.append((x+1, y))
    if y > 0: neighbors.append((x, y-1))
    if y < h - 1: neighbors.append((x, y+1))
    return neighbors

def flood_fill_darken(image_path, target_color=(30, 30, 30, 255), tolerance=40):
    try:
        img = Image.open(image_path).convert("RGBA")
        data = list(img.getdata())
        w, h = img.size
        
        # We start flood fill from the 4 corners to be safe
        bg_color = data[0]
        
        # To avoid re-processing or infinite loops
        visited = set()
        stack = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]
        
        def colors_match(c1, c2, max_diff):
            return (abs(c1[0] - c2[0]) <= max_diff and
                    abs(c1[1] - c2[1]) <= max_diff and
                    abs(c1[2] - c2[2]) <= max_diff)

        # Flood fill
        while stack:
            cx, cy = stack.pop()
            if (cx, cy) in visited:
                continue
            idx = cy * w + cx
            current_color = data[idx]
            
            if colors_match(current_color, bg_color, tolerance):
                visited.add((cx, cy))
                data[idx] = target_color
                stack.extend(get_neighbors(cx, cy, w, h))
                
        img.putdata(data)
        img.save(image_path)
        print(f"Processed {image_path}")
    except Exception as e:
        print(f"Failed to process {image_path}: {e}")

images = [
    'public/icons/wardens_shield.png',
    'public/icons/vampiric_dagger.png',
    'public/icons/silver_mace.png'
]

for img in images:
    flood_fill_darken(img, target_color=(25, 25, 25, 255), tolerance=50)
