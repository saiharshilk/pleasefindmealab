/* Research topics shown on the brain. Each field lives in its own region of the brain
   (see REGION in brain.js) and has its own color. Clicking a topic searches it. */
window.BRAIN_FIELDS = [
  {
    name: "Computing & AI", color: "#8052ff",
    topics: [
      "large language models", "reinforcement learning", "graph neural networks", "computer vision",
      "federated learning", "AI safety", "explainable AI", "quantum computing algorithms",
      "program synthesis", "differential privacy", "neural architecture search", "diffusion models",
      "recommender systems", "edge computing", "distributed systems", "compiler optimization",
      "formal verification", "human-computer interaction", "speech recognition", "machine translation",
      "adversarial robustness", "multi-agent systems", "causal inference", "computational social science",
      "cryptography", "blockchain consensus", "computer graphics", "information retrieval",
      "self-supervised learning", "algorithmic fairness", "natural language processing", "time series forecasting",
    ],
  },
  {
    name: "Neuro & Imaging", color: "#e040fb",
    topics: [
      "brain-computer interfaces", "EEG signal processing", "functional MRI", "neural decoding",
      "optogenetics", "connectomics", "neuroprosthetics", "deep brain stimulation",
      "sleep neuroscience", "memory consolidation", "computational neuroscience", "spiking neural networks",
      "neuroinflammation", "Alzheimer's disease biomarkers", "Parkinson's disease", "neuroplasticity",
      "diffusion tensor imaging", "magnetoencephalography", "retinal imaging", "photoacoustic imaging",
      "ultrasound neuromodulation", "visual cortex", "auditory processing", "motor learning",
      "pain neuroscience", "addiction neuroscience", "glial cells", "neural organoids",
    ],
  },
  {
    name: "Life Sciences & Bio", color: "#ffb829",
    topics: [
      "CRISPR gene editing", "phage therapy", "regenerative medicine", "stem cells",
      "tissue engineering", "synthetic biology", "microbiome", "protein folding",
      "single-cell sequencing", "cancer immunotherapy", "mRNA vaccines", "antimicrobial resistance",
      "drug delivery nanoparticles", "organ-on-a-chip", "epigenetics", "structural biology",
      "bioprinting", "wound healing", "aging and longevity", "metabolic engineering",
      "plant genomics", "infectious disease modeling", "biomaterials", "cardiac regeneration",
      "spatial transcriptomics", "virology", "cell signaling", "evolutionary biology",
    ],
  },
  {
    name: "Physical Sciences", color: "#4f7cff",
    topics: [
      "quantum sensing", "topological materials", "cold plasma", "fusion energy",
      "superconductivity", "dark matter", "gravitational waves", "exoplanets",
      "metamaterials", "photonics", "quantum optics", "2D materials",
      "condensed matter theory", "particle physics", "cosmology", "plasma physics",
      "atomic clocks", "nonlinear optics", "spintronics", "soft matter",
      "computational chemistry", "catalysis", "polymer chemistry", "electrochemistry",
      "crystal growth", "high-pressure physics", "astrochemistry", "ultrafast lasers",
    ],
  },
  {
    name: "Engineering & Robotics", color: "#2ec4a6",
    topics: [
      "soft robots", "swarm robotics", "autonomous vehicles", "legged locomotion",
      "robot manipulation", "exoskeletons", "microrobots", "drones",
      "control theory", "additive manufacturing", "MEMS sensors", "wearable electronics",
      "flexible electronics", "structural health monitoring", "aerospace propulsion", "hypersonics",
      "fluid dynamics", "turbulence", "composite materials", "biomechanics",
      "haptics", "human-robot interaction", "SLAM", "power electronics",
      "wireless communication", "6G networks", "VLSI design", "smart materials",
    ],
  },
  {
    name: "Energy & Environment", color: "#ff6b8b",
    topics: [
      "solid-state batteries", "perovskite solar cells", "hydrogen fuel cells", "carbon capture",
      "climate modeling", "wind energy", "smart grids", "ocean acidification",
      "water desalination", "microplastics", "wildfire prediction", "sustainable agriculture",
      "biofuels", "nuclear fission reactors", "geothermal energy", "air quality",
      "remote sensing", "glaciology", "biodiversity loss", "circular economy",
    ],
  },
];
