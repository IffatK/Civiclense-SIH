import os

dataset_path = "static/dataset"

class_names = sorted([
    folder for folder in os.listdir(dataset_path)
    if os.path.isdir(os.path.join(dataset_path, folder))
    and not folder.startswith(".")
])

print("Total categories:", len(class_names))
print()

total_images = 0

for category in class_names:
    folder = os.path.join(dataset_path, category)

    images = [
        f for f in os.listdir(folder)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    ]

    print(f"{category}: {len(images)}")
    total_images += len(images)

print()
print("TOTAL IMAGES:", total_images)