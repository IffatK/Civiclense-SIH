import os
import shutil
import random

SOURCE = "static/dataset"
OUTPUT = "dataset_split"

TRAIN_RATIO = 0.80
random.seed(42)

VALID_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

categories = sorted([
    folder for folder in os.listdir(SOURCE)
    if os.path.isdir(os.path.join(SOURCE, folder))
    and not folder.startswith(".")
])

print("Total categories:", len(categories))
print()

for category in categories:

    source_folder = os.path.join(SOURCE, category)

    images = [
        f for f in os.listdir(source_folder)
        if f.lower().endswith(VALID_EXTENSIONS)
    ]

    random.shuffle(images)

    split_index = int(len(images) * TRAIN_RATIO)

    train_images = images[:split_index]
    validation_images = images[split_index:]

    train_folder = os.path.join(
        OUTPUT, "train", category
    )

    validation_folder = os.path.join(
        OUTPUT, "validation", category
    )

    os.makedirs(train_folder, exist_ok=True)
    os.makedirs(validation_folder, exist_ok=True)

    for image in train_images:
        shutil.copy2(
            os.path.join(source_folder, image),
            os.path.join(train_folder, image)
        )

    for image in validation_images:
        shutil.copy2(
            os.path.join(source_folder, image),
            os.path.join(validation_folder, image)
        )

    print(
        f"{category}: "
        f"{len(train_images)} train, "
        f"{len(validation_images)} validation"
    )

print()
print("✅ Dataset split completed.")