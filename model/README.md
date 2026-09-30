# 🏛️ Public Complaint AI

## AI-Based Civic Issue Detection System

Public Complaint AI is an AI-powered system designed to identify common civic issues from images submitted by citizens.

The system uses a deep learning image classification model to analyze an uploaded complaint image and automatically identify the type of civic issue. It also provides a confidence score and recommends manual review when the model is not sufficiently confident.

---

## 🎯 Problem Statement

Citizens frequently encounter civic problems such as potholes, broken footpaths, garbage overflow, damaged streetlights, open manholes, water leakage, and other public infrastructure issues.

Manually reviewing and categorizing every complaint can be time-consuming.

**Public Complaint AI** aims to assist authorities by automatically classifying civic-issue images into predefined categories.

---

## 💡 Proposed Solution

The system follows this workflow:

```text
Citizen uploads image
        ↓
Image preprocessing
        ↓
AI image classification model
        ↓
Civic issue identification
        ↓
Confidence score
        ↓
Automatic detection / Manual review
        ↓
Issue description
Objectives

The main objectives of the project are:

Automatically identify civic issues from images.
Reduce manual effort in initial complaint categorization.
Provide a confidence score for every prediction.
Flag uncertain predictions for manual verification.
Provide clear descriptions of detected civic issues.
Create a foundation for intelligent civic complaint management.
Support faster and more organized handling of public complaints.
🚀 Key Features
Image-based civic complaint submission
🤖 AI-powered image classification
🏷️ 22 civic issue categories
📊 Prediction confidence score
⚠️ Low-confidence manual review
📝 Professional issue descriptions
🌐 Flask-based web application
🖥️ Simple and user-friendly interface
🔄 Real-time prediction after image upload 

🔄 System Workflow

The complete system follows these steps:

Step 1 — Image Upload

The citizen uploads an image showing a civic issue.

Step 2 — Image Preprocessing

The uploaded image is:

Converted to RGB
Resized to 224 × 224 pixels
Converted into a numerical array
Step 3 — AI Prediction

The processed image is passed to the trained MobileNetV2-based classification model.

Step 4 — Classification

The model predicts one of the 22 civic issue categories.

Step 5 — Confidence Calculation

The system calculates the confidence score of the predicted category.

Step 6 — Decision

If the confidence is at least 60%, the system marks the issue as:

Automatically Detected

If the confidence is below 60%, the system marks it as:

Low Confidence - Manual Review Required
Step 7 — Issue Description

A professional description of the detected civic issue is displayed to the user.

🏷️ Civic Issue Categories

The current system supports 22 categories:

No.	Category
1	Broken Footpath
2	Broken Streetlight
3	Construction Debris
4	Contaminated Water
5	Damaged Park Equipment
6	Damaged Traffic Signal
7	Damp or Seepage
8	Dead Animal
9	Exposed Wire
10	Fallen Tree
11	Flooding
12	Footpath Encroachment
13	Garbage Overflow
14	Illegal Dumping
15	Illegal Parking
16	Open Manhole
17	Pothole
18	Public Toilet Unusable
19	Road Crack
20	Stray Animal Concern
21	Unhygienic Food Stall
22	Water Leakage
🛠️ Technology Stack
Programming Language
Python
Machine Learning
TensorFlow
Keras
MobileNetV2
NumPy
Image Processing
Pillow (PIL)
Web Development
Flask
HTML
CSS
Development Tools
Visual Studio Code
Jupyter Notebook
📊 Dataset

The project currently uses a custom image dataset organized into 22 civic issue categories.

Dataset Statistics
Total Categories: 22
Total Real Images: 653
Training Images: 513
Validation Images: 139

The images are organized category-wise inside:

static/dataset/

Example:

static/dataset/
├── broken_footpath/
├── broken_streetlight/
├── construction_debris/
├── contaminated_water/
├── damaged_park_equipment/
├── damaged_traffic_signal/
├── damp_or_seepage/
├── dead_animal/
├── exposed_wire/
├── fallen_tree/
├── flooding/
├── footpath_encroachment/
├── garbage_overflow/
├── illegal_dumping/
├── illegal_parking/
├── open_manhole/
├── pothole/
├── public_toilet_unusable/
├── road_crack/
├── stray_animal_concern/
├── unhygienic_food_stall/
└── water_leakage/
🧠 AI Model

The project uses MobileNetV2 as the primary image classification architecture.

MobileNetV2 is a lightweight convolutional neural network architecture that is suitable for image classification applications.

The project uses transfer learning to adapt the pretrained network for civic issue classification.

Model Configuration
Parameter	Value
Architecture	MobileNetV2
Input Size	224 × 224
Number of Classes	22
Dataset Size	653 images
Training Images	513
Validation Images	139
Best Validation Accuracy	66.19%
Model Format	.keras
📈 Model Performance

Multiple model versions were evaluated during development.

Model Version	Validation Accuracy
V1	58.99%
V2	60.43%
V3	66.19%
New Model	64.75%
🏆 Best Model

The V3 model achieved the highest validation accuracy of 66.19% among the tested versions.

The V3 model is therefore used by the Flask application.

📁 Project Structure
PublicComplaintAI/
│
├── app.py
├── train_model.py
├── split_dataset.py
│
├── static/
│   ├── public_complaint_model_v3_backup.keras
│   │
│   └── dataset/
│       ├── broken_footpath/
│       ├── broken_streetlight/
│       ├── construction_debris/
│       ├── contaminated_water/
│       ├── damaged_park_equipment/
│       ├── damaged_traffic_signal/
│       ├── damp_or_seepage/
│       ├── dead_animal/
│       ├── exposed_wire/
│       ├── fallen_tree/
│       ├── flooding/
│       ├── footpath_encroachment/
│       ├── garbage_overflow/
│       ├── illegal_dumping/
│       ├── illegal_parking/
│       ├── open_manhole/
│       ├── pothole/
│       ├── public_toilet_unusable/
│       ├── road_crack/
│       ├── stray_animal_concern/
│       ├── unhygienic_food_stall/
│       └── water_leakage/
│
├── dataset_split/
│   ├── train/
│   └── validation/
│
├── templates/
│   └── index.html
│
├── uploads/
│
└── README.md
⚙️ Installation
1. Open the Project

Open the PublicComplaintAI folder in Visual Studio Code.

2. Install Required Packages

Open the VS Code terminal and run:

python -m pip install tensorflow flask pillow numpy
3. Verify the Model

Make sure the trained V3 model exists at:

static/public_complaint_model_v3_backup.keras
▶️ How to Run

Open the terminal inside the project folder:

python app.py

If everything is configured correctly, Flask will display:

* Running on http://127.0.0.1:5000

Open the following address in a web browser:

http://127.0.0.1:5000
🖥️ How to Use
Open the Public Complaint AI website.
Click Choose File.
Select an image of a civic issue.
Click Detect Issue.
The AI model analyzes the image.
The predicted category is displayed.
The confidence score is displayed.
The system provides an issue description.
Low-confidence predictions are recommended for manual verification.
📊 Confidence-Based Detection

The system currently uses a confidence threshold of:

60%
High Confidence

If:

Confidence ≥ 60%

the system displays:

Automatically Detected
Low Confidence

If:

Confidence < 60%

the system displays:

Low Confidence - Manual Review Required

This approach helps ensure that uncertain AI predictions are not treated as completely reliable.

🖼️ Application Screenshots

Add screenshots of the working application here.

Create a folder:

screenshots/

Then place your screenshots inside it.

Example:

screenshots/
├── home.png
├── broken_footpath.png
└── detection_result.png

Then add them to this README:

## 🖥️ Application Screenshots

### Home Page

![Home Page](screenshots/home.png)

### AI Detection Result

![AI Detection Result](screenshots/detection_result.png)
🧪 Testing

The system was tested using real civic-issue images.

Example:

Broken Footpath
Actual Category: Broken Footpath
Predicted Category: Broken Footpath
Confidence: 40.63%
Status: Low Confidence - Manual Review Required
Broken Streetlight
Actual Category: Broken Streetlight
Predicted Category: Broken Streetlight
Confidence: 83.15%
Status: Automatically Detected

These examples demonstrate that the application can perform image-based civic issue classification and provide confidence-based feedback.

⚠️ Limitations

The current prototype has several limitations:

The dataset contains a limited number of images.
The number of images varies between categories.
Some categories have fewer examples than others.
Visually similar civic issues may sometimes be confused.
The current validation accuracy is 66.19%.
Low-confidence predictions require manual verification.
The system currently focuses on image classification rather than complete complaint lifecycle management.
🚀 Future Scope

The system can be extended with several features:

📍 GPS-Based Complaint Location

Automatically capture the location where the complaint was submitted.

🗺️ Civic Issue Map

Display reported civic issues on an interactive map.

🏢 Automatic Department Assignment

Automatically route complaints to departments such as:

Road Department
Sanitation Department
Water Supply Department
Electricity Department
Municipal Administration
🚨 Priority Detection

Assign complaint priority based on severity.

👤 Citizen Login

Allow citizens to create accounts and track submitted complaints.

🔔 Complaint Status Notifications

Notify citizens when their complaint is:

Submitted
    ↓
Under Review
    ↓
Assigned
    ↓
In Progress
    ↓
Resolved
📱 Mobile Application

Develop an Android/iOS application for easier citizen reporting.

📊 Authority Dashboard

Provide municipal authorities with:

Total complaints
Pending complaints
Resolved complaints
Issue distribution
Location-based analysis
Priority complaints
🔄 Duplicate Complaint Detection

Detect multiple complaints referring to the same civic issue.

📈 Improved AI Model

Increase dataset size and improve class balance to achieve better classification performance.

🏆 SIH Relevance

Public Complaint AI is designed as an AI-assisted solution for civic complaint management.

The project focuses on:

Artificial Intelligence
Computer Vision
Automated complaint classification
Public infrastructure monitoring
Citizen participation
Data-driven civic management

The system can serve as an intelligent first-level classification layer before complaints are reviewed and processed by the appropriate authorities.

Update the team member names and roles according to your actual team.

📌 Project Status
Current Status: Working Prototype ✅

The current prototype includes:

✅ 22 civic issue categories
✅ Custom image dataset
✅ MobileNetV2-based classification
✅ Model training and validation
✅ Best validation accuracy of 66.19%
✅ Saved trained model
✅ Flask web application
✅ Image upload
✅ AI prediction
✅ Confidence score
✅ Confidence-based manual review
✅ Professional issue descriptions
📄 License

This project is developed for educational, research, and Smart India Hackathon purposes.

❤️ Acknowledgement

This project was developed as part of the Smart India Hackathon (SIH) initiative with the goal of exploring how Artificial Intelligence can assist in solving real-world civic problems.

🌟 Conclusion

Public Complaint AI demonstrates how Artificial Intelligence and Computer Vision can be used to assist in identifying civic issues from images.

By combining image classification with confidence-based verification, the system provides a foundation for faster, more organized, and scalable civic complaint management.

The project can be further enhanced with GPS, databases, department routing, dashboards, mobile applications, and improved AI models to create a complete smart civic complaint management platform.


