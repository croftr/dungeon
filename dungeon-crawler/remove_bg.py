from PIL import Image

def remove_bg(img_path, threshold=50):
    try:
        img = Image.open(img_path).convert("RGBA")
        data = list(img.getdata())
        
        # sample top left corner
        bg_col = data[0]
        
        def diff(c1, c2):
            return max(abs(c1[0] - c2[0]), abs(c1[1] - c2[1]), abs(c1[2] - c2[2]))
        
        # We need a flood fill to only remove exterior background, otherwise it will destroy green elements inside!
        # Flood fill is safer for backgrounds.
        w, h = img.size
        visited = set()
        stack = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]
        
        while stack:
            cx, cy = stack.pop()
            if (cx, cy) in visited:
                continue
            idx = cy * w + cx
            current_color = data[idx]
            
            if diff(current_color, bg_col) <= threshold:
                visited.add((cx, cy))
                data[idx] = (0, 0, 0, 0) # transparent
                
                if cx > 0: stack.append((cx-1, cy))
                if cx < w - 1: stack.append((cx+1, cy))
                if cy > 0: stack.append((cx, cy-1))
                if cy < h - 1: stack.append((cx, cy+1))
                
        img.putdata(data)
        img.save(img_path)
        print(f"Removed bg from {img_path}")
    except Exception as e:
        print(f"Failed {img_path}: {e}")

images = [
    "public/parchment_bg.png"
]
for i in images:
    remove_bg(i, 80)
