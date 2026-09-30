/**
 * Who is in the demo.
 *
 * Written out rather than generated from name pools. A combiner produces
 * "Rahul Iyer" and "Sunita Fernandes-Shaikh" eventually, and a demo whose
 * citizen list reads as slightly wrong names is worse than one with fewer
 * people in it. These are ordinary Mumbai names in the proportions the city
 * actually has — Maharashtrian, Gujarati, Muslim, South Indian, North Indian,
 * Christian, Parsi, Sindhi.
 *
 * Nobody here is real. The accounts are demo-only and live on a domain that
 * does not resolve.
 */

/**
 * Residents, with the ward they report from and how active they are.
 *
 * tier drives how many reports they file, which is what makes the leaderboard
 * worth looking at: a handful of people carry most of the reporting, a long
 * tail files one thing, and some accounts have never filed at all — which is
 * what a real civic platform looks like.
 */
export const CITIZENS = [
  ["Ayesha Shaikh", "L", "champion", "en"],
  ["Rahul Patil", "N", "champion", "mr"],
  ["Sneha Kulkarni", "G-North", "champion", "mr"],
  ["Mohammed Faizan", "M-East", "champion", "hi"],
  ["Priya Nair", "K-East", "champion", "en"],
  ["Aditya Deshmukh", "S", "champion", "mr"],
  ["Nikhil Sawant", "F-North", "regular", "mr"],
  ["Farhana Ansari", "M-West", "regular", "hi"],
  ["Ganesh Bhosale", "T", "regular", "mr"],
  ["Meenakshi Iyer", "H-West", "regular", "en"],
  ["Imran Qureshi", "E", "regular", "hi"],
  ["Kavita Rane", "P-South", "regular", "mr"],
  ["Sanjay Gaikwad", "L", "regular", "mr"],
  ["Ritu Malhotra", "K-West", "regular", "en"],
  ["Suresh Pillai", "R-Central", "regular", "en"],
  ["Zoya Merchant", "A", "regular", "en"],
  ["Vikram Chauhan", "N", "regular", "hi"],
  ["Anjali Joshi", "G-South", "regular", "mr"],
  ["Rizwan Shaikh", "M-East", "regular", "hi"],
  ["Deepa Menon", "H-East", "regular", "en"],
  ["Prakash Jadhav", "F-South", "occasional", "mr"],
  ["Shalini Verma", "P-North", "occasional", "hi"],
  ["Arif Khan", "B", "occasional", "hi"],
  ["Neha Joshi", "T", "occasional", "mr"],
  ["Karthik Raman", "K-East", "occasional", "en"],
  ["Pooja Shetty", "R-South", "occasional", "en"],
  ["Mahesh Tawde", "S", "occasional", "mr"],
  ["Sana Khan", "L", "occasional", "hi"],
  ["Rohan Shinde", "M-West", "occasional", "mr"],
  ["Lata Kamble", "N", "occasional", "mr"],
  ["Jignesh Mehta", "C", "occasional", "en"],
  ["Fatima Bano", "E", "occasional", "hi"],
  ["Sandeep Yadav", "H-East", "occasional", "hi"],
  ["Vaishali More", "G-North", "occasional", "mr"],
  ["Nitin Agarwal", "R-Central", "occasional", "hi"],
  ["Grace Fernandes", "H-West", "occasional", "en"],
  ["Omkar Salvi", "F-North", "occasional", "mr"],
  ["Ruksana Sayyed", "M-East", "occasional", "hi"],
  ["Harish Nadar", "L", "occasional", "en"],
  ["Swati Deshpande", "P-South", "occasional", "mr"],
  ["Aakash Bhatia", "K-West", "occasional", "en"],
  ["Divya Krishnan", "H-East", "occasional", "en"],
  ["Tushar Mhatre", "T", "occasional", "mr"],
  ["Nargis Contractor", "D", "occasional", "en"],
  ["Balaji Subramaniam", "K-East", "occasional", "en"],
  ["Shraddha Powar", "N", "occasional", "mr"],
  ["Yusuf Memon", "B", "occasional", "hi"],
  ["Alka Bhandari", "R-North", "occasional", "hi"],
  ["Chetan Wagh", "S", "occasional", "mr"],
  ["Tanvi Desai", "G-South", "occasional", "en"],
  ["Abdul Rehman", "M-West", "occasional", "hi"],
  ["Manisha Lokhande", "F-South", "occasional", "mr"],
  ["Devendra Sharma", "P-North", "occasional", "hi"],
  ["Reshma Pathan", "L", "occasional", "hi"],
  ["Joseph D'Souza", "H-West", "occasional", "en"],
  // Registered, never filed anything. Real platforms are full of these and a
  // citizen list without them looks curated.
  ["Ashwini Chavan", "R-South", "silent", "mr"],
  ["Parvez Alam", "E", "silent", "hi"],
  ["Smita Ghosh", "A", "silent", "en"],
  ["Ramesh Solanki", "C", "silent", "en"],
  ["Heena Vora", "D", "silent", "en"],
  ["Akshay Kadam", "T", "silent", "mr"],
  ["Leela Naik", "R-Central", "silent", "en"],
];

/**
 * Field officers.
 *
 * performance is not a score written anywhere — it decides how their assigned
 * complaints actually close, and the leaderboard is computed from that. A
 * "strong" officer resolves nearly everything before the deadline; "struggling"
 * carries genuine overdue work and rework. Writing the ranking directly would
 * make the leaderboard a picture of a leaderboard.
 */
export const OFFICERS = [
  ["Sunil Ghorpade", "Assistant Engineer (Roads)", "ROADS", "L", "strong"],
  ["Rekha Salunkhe", "Executive Engineer (Roads)", "ROADS", "N", "strong"],
  ["Amit Varma", "Junior Engineer (Roads)", "ROADS", "K-East", "steady"],
  ["Nilesh Parab", "Assistant Engineer (Roads)", "ROADS", "P-North", "struggling"],
  ["Sadiq Shaikh", "Sanitation Inspector", "SWM", "M-East", "strong"],
  ["Vandana Kharat", "Assistant Municipal Commissioner (SWM)", "SWM", "L", "steady"],
  ["Prashant Dabholkar", "Sanitation Inspector", "SWM", "G-North", "steady"],
  ["Yogita Pawar", "Sanitation Supervisor", "SWM", "T", "struggling"],
  ["Ravindra Kadu", "Water Supply Engineer", "WATER", "H-East", "strong"],
  ["Shabana Inamdar", "Assistant Engineer (Water Works)", "WATER", "K-West", "steady"],
  ["Girish Naik", "Junior Engineer (Water Works)", "WATER", "R-Central", "steady"],
  ["Dattatray Mane", "Hydraulic Engineer", "WATER", "M-West", "struggling"],
  ["Vinod Kharche", "Electrical Maintenance Officer", "LIGHT", "N", "strong"],
  ["Asha Thorat", "Assistant Engineer (Electrical)", "LIGHT", "S", "steady"],
  ["Mustafa Lakdawala", "Electrical Inspector", "LIGHT", "E", "steady"],
  ["Pravin Bhagat", "Junior Engineer (Electrical)", "LIGHT", "P-South", "struggling"],
  ["Sheetal Rathod", "Traffic Inspector", "TRAFFIC", "H-West", "strong"],
  ["Kiran Zende", "Assistant Traffic Engineer", "TRAFFIC", "G-South", "steady"],
  ["Nagesh Hegde", "Traffic Signal Maintenance Officer", "TRAFFIC", "K-East", "steady"],
  ["Dr. Snehal Bagade", "Municipal Health Officer", "HEALTH", "L", "strong"],
  ["Dr. Iqbal Nadkar", "Assistant Medical Officer of Health", "HEALTH", "M-East", "steady"],
  ["Jyoti Bansode", "Insecticide Officer", "HEALTH", "F-North", "steady"],
  ["Ashok Gawde", "Public Health Inspector", "HEALTH", "R-North", "struggling"],
  ["Farida Kazi", "Food Safety Officer", "FSSAI", "B", "strong"],
  ["Milind Sathe", "Designated Food Safety Officer", "FSSAI", "C", "steady"],
  ["Sudhir Bandekar", "Storm Water Drain Engineer", "DRAIN", "L", "strong"],
  ["Nisha Talpade", "Assistant Engineer (Drains)", "DRAIN", "M-East", "steady"],
  ["Harshad Rege", "Garden Supervisor", "GARDEN", "H-West", "steady"],
  ["Manoj Bhoir", "Tree Officer", "GARDEN", "T", "steady"],
  ["Ajay Survase", "Encroachment Removal Officer", "ENCROACH", "F-South", "struggling"],
];

/** Ward-office administrators, one per department, plus the city-wide account. */
export const STAFF = [
  ["Nandkumar Pednekar", "ROADS"],
  ["Surekha Bhalerao", "SWM"],
  ["Anwar Shaikh", "WATER"],
  ["Deepak Chindarkar", "LIGHT"],
  ["Rupali Gawand", "TRAFFIC"],
  ["Dr. Vidya Sathe", "HEALTH"],
  ["Zainab Merchant", "FSSAI"],
  ["Bhaskar Ovhal", "DRAIN"],
  ["Smita Karkera", "GARDEN"],
  ["Rajendra Waghmare", "ENCROACH"],
];

/**
 * Universities.
 *
 * expertise uses the tag vocabulary the matching view intersects against
 * challenge needs — see challenge_matches_detailed. A university only ever
 * appears against a challenge whose needs overlap these tags, so the tags are
 * the match, not a number somebody typed.
 *
 * Named as institutes of the kind that exist, but none of these is a real
 * institution and every record is marked DEMO.
 */
export const UNIVERSITIES = [
  {
    name: "Sahyadri Institute of Engineering & Technology",
    short: "Sahyadri Institute",
    city: "Mumbai",
    expertise: ["civil", "water", "drainage", "gis", "iot"],
    research: ["Urban drainage modelling", "Resilient infrastructure", "Flood forecasting"],
    labs: ["Water Resources Research Lab", "Smart Infrastructure Research Centre", "Geospatial Analytics Lab"],
    departments: [
      ["Civil Engineering", ["civil", "water", "drainage"], ["Storm-water modelling", "Structural assessment"], ["Hydraulics Lab", "Structures Lab"]],
      ["Computer Engineering", ["ai", "computer_vision", "data"], ["Computer vision", "Edge inference"], ["Computer Vision Lab"]],
      ["Environmental Engineering", ["water", "environmental", "waste"], ["Water quality", "Urban environmental monitoring"], ["Environmental Monitoring Lab"]],
      ["Electronics & Telecommunication", ["iot", "hardware"], ["Low-power sensing", "LPWAN networks"], ["IoT Innovation Centre"]],
      ["Information Technology", ["mobile", "data", "gis"], ["Geospatial systems", "Field data collection"], ["Geospatial Analytics Lab"]],
    ],
  },
  {
    name: "Konkan College of Engineering",
    short: "Konkan College",
    city: "Navi Mumbai",
    expertise: ["roads", "civil", "gis", "data", "mobile"],
    research: ["Pavement condition assessment", "Road safety audits", "Accessibility mapping"],
    labs: ["Transportation Engineering Lab", "Mobility & Transport Lab", "Urban Analytics Lab"],
    departments: [
      ["Civil Engineering", ["civil", "roads"], ["Pavement engineering", "Road safety"], ["Transportation Engineering Lab", "Materials Testing Lab"]],
      ["Information Technology", ["mobile", "data"], ["Mobile data collection", "Analytics dashboards"], ["Urban Analytics Lab"]],
      ["Mechanical Engineering", ["hardware"], ["Instrumentation", "Mechanical prototyping"], ["Prototyping Workshop"]],
      ["Architecture", ["urban_design", "gis"], ["Universal design", "Streetscape design"], ["Design Studio"]],
    ],
  },
  {
    name: "Deccan Institute of Environmental Sciences",
    short: "Deccan Institute",
    city: "Pune",
    expertise: ["environmental", "waste", "public_health", "water", "data"],
    research: ["Solid waste characterisation", "Source segregation behaviour", "Leachate management"],
    labs: ["Environmental Monitoring Lab", "Solid Waste Research Lab", "Public Health Data Lab"],
    departments: [
      ["Environmental Engineering", ["environmental", "waste", "water"], ["Municipal solid waste", "Composting systems"], ["Solid Waste Research Lab"]],
      ["Public Health", ["public_health", "data"], ["Vector-borne disease surveillance", "Sanitation and health"], ["Public Health Data Lab"]],
      ["Biotechnology", ["environmental"], ["Bioremediation", "Water microbiology"], ["Microbiology Lab"]],
      ["Data Science", ["data", "ai"], ["Spatial epidemiology", "Predictive modelling"], ["Data Science Lab"]],
    ],
  },
  {
    name: "Matoshri Institute of Technology",
    short: "Matoshri Institute",
    city: "Nashik",
    expertise: ["iot", "hardware", "ai", "computer_vision", "data"],
    research: ["Low-cost sensing", "Embedded machine learning", "Industrial IoT"],
    labs: ["IoT Innovation Centre", "Embedded Systems Lab", "AI Research Centre"],
    departments: [
      ["Electronics & Telecommunication", ["iot", "hardware"], ["Embedded systems", "Sensor networks"], ["Embedded Systems Lab", "IoT Innovation Centre"]],
      ["Computer Engineering", ["ai", "computer_vision"], ["Deep learning", "Image classification"], ["AI Research Centre", "Computer Vision Lab"]],
      ["Electrical Engineering", ["hardware", "energy"], ["Power electronics", "Solar systems"], ["Power Systems Lab"]],
      ["Artificial Intelligence & Data Science", ["ai", "data"], ["Applied machine learning", "Time-series forecasting"], ["AI Research Centre"]],
    ],
  },
  {
    name: "Vidyasagar Institute of Urban Planning",
    short: "Vidyasagar Institute",
    city: "Mumbai",
    expertise: ["gis", "urban_design", "data", "public_health", "mobile"],
    research: ["Land-use planning", "Public space accessibility", "Urban heat mapping"],
    labs: ["Urban Analytics Lab", "GIS & Remote Sensing Lab", "Social Innovation Cell"],
    departments: [
      ["Urban Planning", ["urban_design", "gis"], ["Land use", "Public space design"], ["GIS & Remote Sensing Lab"]],
      ["Geoinformatics", ["gis", "data"], ["Remote sensing", "Spatial statistics"], ["GIS & Remote Sensing Lab"]],
      ["Public Policy", ["public_health", "data"], ["Service delivery", "Participatory governance"], ["Social Innovation Cell"]],
      ["Computer Engineering", ["data", "mobile"], ["Civic technology", "Open data platforms"], ["Urban Analytics Lab"]],
    ],
  },
  {
    name: "Anand Vidyapeeth College of Engineering",
    short: "Anand Vidyapeeth",
    city: "Thane",
    expertise: ["ai", "computer_vision", "data", "mobile"],
    research: ["Visual inspection automation", "Document intelligence", "Model reliability"],
    labs: ["Computer Vision Lab", "AI Research Centre", "Software Engineering Lab"],
    departments: [
      ["Computer Engineering", ["ai", "computer_vision"], ["Object detection", "Model evaluation"], ["Computer Vision Lab"]],
      ["Artificial Intelligence & Data Science", ["ai", "data"], ["Dataset curation", "MLOps"], ["AI Research Centre"]],
      ["Information Technology", ["mobile", "data"], ["Progressive web apps", "API design"], ["Software Engineering Lab"]],
      ["Electronics & Telecommunication", ["hardware", "iot"], ["Camera systems", "Edge devices"], ["Embedded Systems Lab"]],
    ],
  },
  {
    name: "Rachana Sansad Academy of Architecture & Design",
    short: "Rachana Sansad Academy",
    city: "Mumbai",
    expertise: ["urban_design", "civil", "gis", "accessibility"],
    research: ["Universal accessibility", "Pedestrian infrastructure", "Public realm"],
    labs: ["Design Studio", "Accessibility Lab", "Materials Workshop"],
    departments: [
      ["Architecture", ["urban_design", "accessibility"], ["Barrier-free design", "Public realm"], ["Design Studio", "Accessibility Lab"]],
      ["Urban Design", ["urban_design", "gis"], ["Streetscape", "Walkability"], ["Design Studio"]],
      ["Civil Engineering", ["civil"], ["Footpath construction", "Material selection"], ["Materials Workshop"]],
    ],
  },
  {
    name: "Bharati Institute of Public Health",
    short: "Bharati Institute",
    city: "Pune",
    expertise: ["public_health", "data", "environmental", "mobile"],
    research: ["Vector control", "Community health surveillance", "Sanitation outcomes"],
    labs: ["Public Health Data Lab", "Entomology Lab", "Community Health Research Unit"],
    departments: [
      ["Public Health", ["public_health", "data"], ["Epidemiology", "Health systems"], ["Public Health Data Lab"]],
      ["Community Medicine", ["public_health"], ["Field surveillance", "Health education"], ["Community Health Research Unit"]],
      ["Environmental Health", ["environmental", "public_health"], ["Vector ecology", "Water and sanitation"], ["Entomology Lab"]],
      ["Health Informatics", ["data", "mobile"], ["Digital health records", "Field applications"], ["Public Health Data Lab"]],
    ],
  },
  {
    name: "Saraswati Institute of Technology & Management",
    short: "Saraswati Institute",
    city: "Mumbai",
    expertise: ["data", "mobile", "management", "iot"],
    research: ["Service operations", "Citizen engagement", "Cost modelling"],
    labs: ["Urban Analytics Lab", "Business Innovation Cell", "IoT Innovation Centre"],
    departments: [
      ["Management Studies", ["management", "data"], ["Operations research", "Public service delivery"], ["Business Innovation Cell"]],
      ["Information Technology", ["mobile", "data"], ["Citizen-facing applications", "Analytics"], ["Urban Analytics Lab"]],
      ["Computer Engineering", ["data", "ai"], ["Recommendation systems", "Workflow automation"], ["Software Engineering Lab"]],
      ["Electronics & Telecommunication", ["iot"], ["Asset tracking", "Telemetry"], ["IoT Innovation Centre"]],
    ],
  },
  {
    name: "Ratnagiri College of Rural Technology",
    short: "Ratnagiri College",
    city: "Palghar",
    expertise: ["water", "energy", "iot", "environmental", "civil"],
    research: ["Decentralised water systems", "Rural energy access", "Low-cost construction"],
    labs: ["Water Resources Research Lab", "Renewable Energy Lab", "Rural Innovation Centre"],
    departments: [
      ["Civil Engineering", ["civil", "water"], ["Water supply schemes", "Low-cost construction"], ["Hydraulics Lab"]],
      ["Electrical Engineering", ["energy", "hardware"], ["Solar power", "Off-grid systems"], ["Renewable Energy Lab"]],
      ["Environmental Engineering", ["environmental", "water"], ["Water treatment", "Sanitation"], ["Water Resources Research Lab"]],
      ["Computer Engineering", ["iot", "data"], ["Remote monitoring", "Low-bandwidth systems"], ["Rural Innovation Centre"]],
    ],
  },
];

/**
 * Industry, startup, CSR and NGO organisations.
 *
 * Fictional. They are recorded as support organisations and never described as
 * partnerships with any real company — a database claiming a real firm has
 * backed a student project is a lie with somebody else's name on it.
 */
export const PARTNERS = [
  ["Tapti Sensor Systems", "industry", "Navi Mumbai", "Industrial IoT hardware", ["iot", "hardware"], ["mentorship", "technology", "testing"]],
  ["Meghdoot Analytics", "industry", "Pune", "Geospatial data services", ["gis", "data"], ["mentorship", "technology"]],
  ["Nirmal Waste Services Pvt Ltd", "industry", "Mumbai", "Municipal waste contracting", ["waste"], ["pilot_support", "deployment_support"]],
  ["Saftech Embedded Labs", "industry", "Thane", "Embedded product engineering", ["hardware", "iot"], ["mentorship", "technology", "testing"]],
  ["Vaayu Environmental Instruments", "industry", "Ahmedabad", "Environmental sensing instruments", ["environmental", "hardware"], ["technology", "testing"]],
  ["Setu Civic Technologies", "industry", "Bengaluru", "Civic software platforms", ["data", "mobile"], ["mentorship", "technology"]],
  ["Pragati Infra Solutions", "industry", "Mumbai", "Civil works and installation", ["civil"], ["deployment_support", "pilot_support"]],
  ["Anant Renewables", "industry", "Nashik", "Solar and off-grid power", ["energy"], ["technology", "funding"]],
  ["Drishti Vision Systems", "industry", "Pune", "Machine vision integration", ["computer_vision", "ai"], ["mentorship", "technology"]],
  ["Kaveri Water Technologies", "industry", "Mumbai", "Water quality instrumentation", ["water", "hardware"], ["technology", "testing"]],
  ["Udaan Foundation", "ngo", "Mumbai", "Urban livelihoods and sanitation", ["public_health", "community"], ["pilot_support", "mentorship"]],
  ["Paani Panchayat Trust", "ngo", "Pune", "Community water governance", ["water", "community"], ["pilot_support", "mentorship"]],
  ["Swachh Sahyog Samiti", "ngo", "Mumbai", "Neighbourhood waste segregation", ["waste", "community"], ["pilot_support", "deployment_support"]],
  ["Aarogya Jan Manch", "ngo", "Mumbai", "Community health outreach", ["public_health", "community"], ["pilot_support"]],
  ["Sakhi Urban Mobility Collective", "ngo", "Mumbai", "Safe mobility for women and elders", ["accessibility", "community"], ["mentorship", "pilot_support"]],
  ["Hariyali Green Trust", "ngo", "Thane", "Urban tree cover and open spaces", ["environmental", "community"], ["pilot_support"]],
  ["Disha Disability Rights Forum", "ngo", "Mumbai", "Accessibility advocacy", ["accessibility", "community"], ["mentorship", "testing"]],
  ["Jal Suraksha Abhiyan", "ngo", "Nagpur", "Drinking water safety campaigns", ["water", "community"], ["pilot_support"]],
  ["Shikhar CSR Foundation", "ngo", "Mumbai", "Corporate social responsibility grants", ["community"], ["funding", "mentorship"]],
  ["Maharashtra Urban Research Council", "research", "Pune", "Applied urban policy research", ["urban_design", "data"], ["mentorship", "technology"]],
];

/**
 * Faculty.
 *
 * [name, designation, institution index, department index within that
 * institution, specialisation, years of experience]. Specialisations are
 * written to match what the department actually does, because the Campus
 * screens show them next to the challenges they are mentoring.
 */
export const FACULTY = [
  ["Dr. Meera Kulkarni", "Associate Professor", 0, 0, "Urban drainage systems, storm-water modelling and resilient infrastructure", 14],
  ["Prof. Arvind Nair", "Professor", 0, 1, "Computer vision, machine learning and geospatial analytics", 21],
  ["Dr. Sana Qureshi", "Assistant Professor", 0, 2, "Solid waste management and urban environmental monitoring", 8],
  ["Dr. Hemant Gokhale", "Associate Professor", 0, 3, "Low-power wireless sensor networks and LPWAN deployment", 12],
  ["Prof. Lalitha Sundaram", "Professor", 0, 4, "Geospatial information systems and field data infrastructure", 19],
  ["Dr. Sameer Pathak", "Assistant Professor", 0, 0, "Hydraulic structures and open-channel flow", 7],
  ["Dr. Ritika Bhattacharya", "Associate Professor", 0, 1, "Edge inference and model compression", 11],
  ["Dr. Prashant Kale", "Professor", 1, 0, "Pavement engineering, distress surveys and road asset management", 23],
  ["Dr. Anuradha Gokhale", "Associate Professor", 1, 1, "Mobile data collection and civic analytics dashboards", 13],
  ["Prof. Mahendra Bhoir", "Professor", 1, 2, "Instrumentation, measurement systems and mechanical prototyping", 18],
  ["Ar. Sheetal Karandikar", "Assistant Professor", 1, 3, "Universal design and pedestrian streetscape planning", 9],
  ["Dr. Rajeev Vartak", "Associate Professor", 1, 0, "Road safety audits and junction design", 15],
  ["Dr. Nandini Rao", "Professor", 2, 0, "Municipal solid waste characterisation and composting systems", 20],
  ["Dr. Faisal Merchant", "Associate Professor", 2, 1, "Vector-borne disease surveillance and spatial epidemiology", 12],
  ["Dr. Kalpana Deodhar", "Assistant Professor", 2, 2, "Bioremediation and drinking water microbiology", 6],
  ["Prof. Umesh Chitnis", "Professor", 2, 3, "Predictive modelling for municipal service demand", 17],
  ["Dr. Swapnil Bhagwat", "Assistant Professor", 2, 0, "Leachate management and landfill engineering", 8],
  ["Dr. Ashwini Raut", "Associate Professor", 3, 0, "Embedded systems and industrial sensor design", 13],
  ["Prof. Girish Kamath", "Professor", 3, 1, "Deep learning for image classification and dataset design", 22],
  ["Dr. Neelam Suryavanshi", "Associate Professor", 3, 2, "Power electronics and solar photovoltaic systems", 14],
  ["Dr. Tanmay Bhide", "Assistant Professor", 3, 3, "Applied machine learning and time-series forecasting", 7],
  ["Dr. Salma Nadeem", "Associate Professor", 3, 0, "Low-power firmware and battery-constrained devices", 10],
  ["Prof. Vasant Palkar", "Professor", 4, 0, "Land-use planning and public space governance", 25],
  ["Dr. Ipsita Bose", "Associate Professor", 4, 1, "Remote sensing and spatial statistics", 12],
  ["Dr. Kunal Adhikari", "Assistant Professor", 4, 2, "Participatory governance and service delivery evaluation", 9],
  ["Dr. Manjiri Sathe", "Associate Professor", 4, 3, "Civic technology and open data platforms", 11],
  ["Prof. Rehana Dalvi", "Professor", 4, 0, "Urban heat and climate-responsive planning", 16],
  ["Dr. Vivek Ranganathan", "Professor", 5, 0, "Object detection and visual inspection automation", 20],
  ["Dr. Pallavi Nene", "Associate Professor", 5, 1, "Dataset curation, annotation quality and MLOps", 10],
  ["Dr. Arbaaz Sheikh", "Assistant Professor", 5, 2, "Progressive web applications and offline-first design", 6],
  ["Prof. Sudarshan Ghate", "Professor", 5, 3, "Camera systems and edge computing hardware", 18],
  ["Dr. Trupti Mestry", "Assistant Professor", 5, 0, "Model reliability and failure analysis in vision systems", 7],
  ["Ar. Nitin Sabnis", "Professor", 6, 0, "Barrier-free design and accessible public buildings", 24],
  ["Ar. Farah Lokhandwala", "Associate Professor", 6, 1, "Walkability assessment and streetscape design", 13],
  ["Dr. Chandrakant Mule", "Associate Professor", 6, 2, "Footpath construction materials and durability", 15],
  ["Ar. Devika Ranade", "Assistant Professor", 6, 0, "Inclusive design research and user testing", 8],
  ["Dr. Anil Tandulkar", "Professor", 7, 0, "Epidemiology and municipal health systems", 26],
  ["Dr. Shraddha Kolhe", "Associate Professor", 7, 1, "Community field surveillance and health education", 12],
  ["Dr. Zubair Ahmad", "Associate Professor", 7, 2, "Vector ecology and larval source management", 14],
  ["Dr. Aparna Vaidya", "Assistant Professor", 7, 3, "Digital health records and field data applications", 9],
  ["Dr. Ganesh Pandit", "Professor", 7, 0, "Water, sanitation and hygiene outcome measurement", 19],
  ["Prof. Ashwin Kotian", "Professor", 8, 0, "Operations research for public service delivery", 21],
  ["Dr. Sunanda Hirve", "Associate Professor", 8, 1, "Citizen engagement platforms and analytics", 11],
  ["Dr. Pradeep Junghare", "Assistant Professor", 8, 2, "Workflow automation and scheduling systems", 7],
  ["Dr. Rahima Shaikh", "Associate Professor", 8, 3, "Asset telemetry and municipal fleet tracking", 10],
  ["Dr. Suhas Wandre", "Professor", 9, 0, "Decentralised water supply schemes", 20],
  ["Dr. Bhavana Tikhe", "Associate Professor", 9, 1, "Off-grid solar and rural energy access", 12],
  ["Dr. Nikhil Barve", "Assistant Professor", 9, 2, "Small-scale water treatment and sanitation", 8],
  ["Dr. Rohini Jagtap", "Associate Professor", 9, 3, "Remote monitoring over low-bandwidth networks", 11],
  ["Prof. Yashwant Thorat", "Professor", 9, 0, "Low-cost construction and rural infrastructure", 23],
  ["Dr. Pooja Ramteke", "Assistant Professor", 0, 2, "Air and water quality instrumentation", 6],
  ["Dr. Imtiaz Sayed", "Associate Professor", 1, 1, "Spatial data pipelines for municipal reporting", 12],
  ["Dr. Kirti Solanki", "Assistant Professor", 2, 3, "Health service demand modelling", 7],
  ["Dr. Nachiket Vaze", "Associate Professor", 3, 1, "Transfer learning for small civic datasets", 10],
  ["Dr. Ayesha Farooqui", "Assistant Professor", 4, 1, "Satellite imagery for informal settlement mapping", 8],
  ["Dr. Bhalchandra Naik", "Professor", 5, 1, "Evaluation methodology for classification systems", 17],
  ["Ar. Mohsin Patel", "Assistant Professor", 6, 1, "Tactile paving and wayfinding for low vision", 9],
  ["Dr. Vrinda Mahajan", "Associate Professor", 7, 2, "Entomological surveillance methods", 13],
  ["Dr. Satyajit Dhond", "Assistant Professor", 8, 1, "Behavioural nudges in public service uptake", 6],
  ["Dr. Kavitha Balan", "Associate Professor", 9, 0, "Groundwater recharge and rainwater harvesting", 14],
  ["Dr. Mandar Kulkarni", "Assistant Professor", 0, 3, "Antenna design for dense urban deployment", 7],
  ["Dr. Reema Chandani", "Associate Professor", 1, 0, "Concrete durability under monsoon loading", 12],
  ["Dr. Om Prakash Tiwari", "Professor", 2, 0, "Industrial and construction waste streams", 22],
  ["Dr. Shilpa Pande", "Assistant Professor", 3, 3, "Anomaly detection in sensor streams", 6],
  ["Dr. Jaideep Mathur", "Associate Professor", 4, 2, "Municipal budgeting and capital works prioritisation", 15],
  ["Dr. Nazneen Kagzi", "Assistant Professor", 5, 2, "Multilingual interfaces and field usability", 8],
  ["Ar. Prakash Dandekar", "Associate Professor", 6, 2, "Retrofitting existing footpaths and kerbs", 16],
  ["Dr. Leena Fernandes", "Professor", 7, 0, "Sanitation-linked disease burden studies", 18],
  ["Dr. Amol Sonawane", "Associate Professor", 8, 0, "Cost-benefit analysis of municipal interventions", 13],
  ["Dr. Harsha Vartak", "Assistant Professor", 9, 2, "Point-of-use water disinfection", 7],
];

/**
 * Students, as [name, institution index, department index, year].
 *
 * Skills are assigned from what their department teaches rather than given to
 * everybody, so filtering the student list by a skill returns the people who
 * would plausibly have it.
 */
export const STUDENTS = [
  ["Aarav Kulkarni", 0, 0, 3], ["Ishita Bhardwaj", 0, 1, 4], ["Kabir Shaikh", 0, 2, 3],
  ["Riya Salvi", 0, 3, 2], ["Yash Deshpande", 0, 4, 4], ["Ananya Menon", 0, 0, 4],
  ["Zaid Ansari", 0, 1, 3], ["Tanisha Rane", 0, 2, 2], ["Soham Pethe", 0, 3, 4],
  ["Aditi Bhoir", 0, 4, 3], ["Nachiket Joshi", 0, 0, 2], ["Hiba Khan", 0, 1, 4],
  ["Parth Gokhale", 0, 2, 3], ["Sanika Mhatre", 0, 3, 3], ["Arnav Rege", 0, 4, 2],
  ["Rutuja Kadam", 1, 0, 4], ["Faiz Momin", 1, 1, 3], ["Om Sawant", 1, 2, 4],
  ["Trisha Nadkarni", 1, 3, 3], ["Harsh Vora", 1, 0, 2], ["Saloni Gupte", 1, 1, 4],
  ["Vedant Palkar", 1, 2, 3], ["Mahek Shaikh", 1, 3, 2], ["Sarthak Chavan", 1, 0, 3],
  ["Ira Dcunha", 1, 1, 4], ["Kunal Shirke", 1, 2, 2], ["Prisha Agarwal", 1, 3, 4],
  ["Rehan Dalvi", 2, 0, 3], ["Mrunal Kale", 2, 1, 4], ["Advait Ranade", 2, 2, 2],
  ["Simran Kaur", 2, 3, 3], ["Tejas Bhosale", 2, 0, 4], ["Naina Thakkar", 2, 1, 3],
  ["Aryan Pandit", 2, 2, 4], ["Khushi Jain", 2, 3, 2], ["Siddharth Naik", 2, 0, 3],
  ["Alisha Sayyed", 2, 1, 4], ["Rohit Barve", 2, 2, 3], ["Manasi Dandekar", 2, 3, 4],
  ["Dhruv Parekh", 3, 0, 3], ["Sakshi Waghmare", 3, 1, 4], ["Anas Kazi", 3, 2, 2],
  ["Vaidehi Joshi", 3, 3, 3], ["Neel Trivedi", 3, 0, 4], ["Gauri Sathe", 3, 1, 3],
  ["Imran Mansuri", 3, 2, 4], ["Shruti Hegde", 3, 3, 2], ["Atharva Kulkarni", 3, 0, 3],
  ["Nidhi Solanki", 3, 1, 4], ["Vivaan Shetty", 3, 2, 3], ["Pooja Ghadge", 3, 3, 4],
  ["Rachit Malhotra", 4, 0, 2], ["Ayesha Merchant", 4, 1, 3], ["Sujay Kambli", 4, 2, 4],
  ["Isha Pardeshi", 4, 3, 3], ["Farhan Shaikh", 4, 0, 4], ["Devanshi Mehta", 4, 1, 2],
  ["Ojas Kotwal", 4, 2, 3], ["Radhika Iyer", 4, 3, 4], ["Ameya Bhalerao", 4, 0, 3],
  ["Sneha Rathi", 4, 1, 4], ["Zoheb Patel", 4, 2, 2], ["Kimaya Sawant", 4, 3, 3],
  ["Aniket Deshmukh", 5, 0, 4], ["Tanya Bhatt", 5, 1, 3], ["Rushabh Doshi", 5, 2, 4],
  ["Sara Kadri", 5, 3, 2], ["Pranav Lele", 5, 0, 3], ["Mitali Surve", 5, 1, 4],
  ["Hardik Panchal", 5, 2, 3], ["Aamna Shaikh", 5, 3, 4], ["Karan Bhagat", 5, 0, 2],
  ["Vidhi Shah", 5, 1, 3], ["Samarth Kulthe", 5, 2, 4], ["Laxmi Chodankar", 5, 3, 3],
  ["Rudra Mahajan", 6, 0, 3], ["Aliya Pathan", 6, 1, 4], ["Shaunak Oak", 6, 2, 2],
  ["Bhoomi Thakur", 6, 0, 4], ["Nikhil Chindarkar", 6, 1, 3], ["Ritika Bhanushali", 6, 2, 4],
  ["Ayaan Qureshi", 6, 0, 2], ["Shweta Damle", 6, 1, 3], ["Varun Shanbhag", 6, 2, 4],
  ["Diya Fernandes", 7, 0, 3], ["Salman Mulla", 7, 1, 4], ["Aarohi Kelkar", 7, 2, 2],
  ["Gaurav Ubale", 7, 3, 3], ["Insha Shaikh", 7, 0, 4], ["Mohit Sonar", 7, 1, 3],
  ["Prerna Zende", 7, 2, 4], ["Rohan Dixit", 7, 3, 2], ["Tasneem Bootwala", 7, 0, 3],
  ["Akhil Nambiar", 7, 1, 4], ["Charvi Deshmane", 7, 2, 3], ["Sahil Kurup", 7, 3, 4],
  ["Nirali Gandhi", 8, 0, 3], ["Yuvraj Rathod", 8, 1, 4], ["Maitri Shroff", 8, 2, 2],
  ["Danish Shaikh", 8, 3, 3], ["Kriti Verma", 8, 0, 4], ["Aayush Bendre", 8, 1, 3],
  ["Sanjana Pillai", 8, 2, 4], ["Rehan Faruqui", 8, 3, 2], ["Tanvi Hadkar", 8, 0, 3],
  ["Krish Motwani", 8, 1, 4], ["Anushka Gadre", 8, 2, 3], ["Mihir Lotlikar", 8, 3, 4],
  ["Sagar Wagh", 9, 0, 3], ["Bhakti Save", 9, 1, 4], ["Owais Shaikh", 9, 2, 2],
  ["Renuka Bhoye", 9, 3, 3], ["Jayesh Patil", 9, 0, 4], ["Komal Dhodi", 9, 1, 3],
  ["Arbaz Tadvi", 9, 2, 4], ["Snehal Vartha", 9, 3, 2], ["Mayur Gavit", 9, 0, 3],
  ["Ritesh Valvi", 9, 1, 4], ["Priyanka Jadhav", 9, 2, 3], ["Sahil Bhandare", 9, 3, 4],
  ["Nishant Karve", 0, 0, 4], ["Urvi Chitale", 1, 1, 2], ["Aftab Shaikh", 2, 2, 3],
  ["Gargi Apte", 3, 3, 4], ["Lokesh Tak", 4, 0, 2], ["Myra Sequeira", 5, 1, 3],
  ["Hanif Bhori", 6, 2, 4], ["Aditi Kharche", 7, 3, 3], ["Vishal Nikam", 8, 0, 2],
  ["Suhani Jaiswal", 9, 1, 3],
];

/** Skills a student plausibly has, keyed by the department's expertise tags. */
export const SKILLS_BY_TAG = {
  civil: ["AutoCAD", "Civil Engineering", "Structural Analysis", "Surveying"],
  water: ["Hydraulic Modelling", "EPANET", "Water Quality Testing"],
  drainage: ["Storm-water Modelling", "SWMM", "GIS"],
  roads: ["Pavement Design", "Road Survey", "Total Station"],
  gis: ["GIS", "QGIS", "Remote Sensing", "Spatial Analysis"],
  iot: ["IoT", "ESP32", "LoRaWAN", "Embedded Systems"],
  hardware: ["PCB Design", "Embedded Systems", "Sensor Calibration", "3D Printing"],
  ai: ["Python", "Machine Learning", "TensorFlow", "Data Analytics"],
  computer_vision: ["Computer Vision", "OpenCV", "PyTorch", "Image Annotation"],
  data: ["Python", "SQL", "Data Analytics", "Power BI"],
  mobile: ["React.js", "React Native", "Flutter", "UI/UX"],
  environmental: ["Environmental Engineering", "Water Quality Testing", "Field Sampling"],
  waste: ["Waste Characterisation", "Field Sampling", "Environmental Engineering"],
  public_health: ["Epidemiology", "Survey Design", "Field Research"],
  urban_design: ["Urban Design", "SketchUp", "Site Analysis"],
  accessibility: ["Accessibility Audit", "Universal Design", "User Research"],
  management: ["Project Management", "Cost Estimation", "Stakeholder Analysis"],
  energy: ["Solar PV Design", "Power Electronics"],
  community: ["Community Outreach", "Field Research"],
};
