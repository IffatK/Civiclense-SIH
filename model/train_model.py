import tensorflow as tf
from tensorflow.keras import layers
import os

# ============================================================
# SETTINGS
# ============================================================

TRAIN_DIR = "dataset_split/train"
VAL_DIR = "dataset_split/validation"

IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS = 15

# ============================================================
# LOAD DATASET
# ============================================================

train_ds = tf.keras.utils.image_dataset_from_directory(
    TRAIN_DIR,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    shuffle=True,
    seed=42
)

val_ds = tf.keras.utils.image_dataset_from_directory(
    VAL_DIR,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    shuffle=False
)

class_names = train_ds.class_names

print("\n================================")
print("Number of classes:", len(class_names))
print("Classes:")
for i, name in enumerate(class_names):
    print(i, ":", name)
print("================================\n")

# ============================================================
# DATA AUGMENTATION
# ============================================================

data_augmentation = tf.keras.Sequential([
    layers.RandomFlip("horizontal"),
    layers.RandomRotation(0.10),
    layers.RandomZoom(0.10),
    layers.RandomContrast(0.10)
])

# ============================================================
# MOBILE NET V2
# ============================================================

base_model = tf.keras.applications.MobileNetV2(
    input_shape=(224, 224, 3),
    include_top=False,
    weights="imagenet"
)

# Initially freeze pretrained layers
base_model.trainable = False

# ============================================================
# BUILD MODEL
# ============================================================

model = tf.keras.Sequential([
    tf.keras.Input(shape=(224, 224, 3)),

    data_augmentation,

    layers.Rescaling(
        1.0 / 127.5,
        offset=-1
    ),

    base_model,

    layers.GlobalAveragePooling2D(),

    layers.Dropout(0.4),

    layers.Dense(
        len(class_names),
        activation="softmax"
    )
])

# ============================================================
# COMPILE
# ============================================================

model.compile(
    optimizer=tf.keras.optimizers.Adam(
        learning_rate=0.0005
    ),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"]
)

# ============================================================
# TRAIN
# ============================================================

print("\n🚀 Starting training...\n")

history = model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=EPOCHS
)

# ============================================================
# EVALUATE
# ============================================================

print("\n📊 Final evaluation...\n")

loss, accuracy = model.evaluate(val_ds)

print(
    "Validation Accuracy:",
    round(accuracy * 100, 2),
    "%"
)

# ============================================================
# SAVE MODEL
# ============================================================

MODEL_PATH = "public_complaint_model_new.keras"

model.save(MODEL_PATH)

print("\n✅ Model saved as:")
print(MODEL_PATH)