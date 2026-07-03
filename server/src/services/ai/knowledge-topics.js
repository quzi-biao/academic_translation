/**
 * 科普知识点池
 * 覆盖天文、地质、生物、医学、化学、物理、数学、历史、环境、认知、纳米等 10+ 领域
 * 供深入探索「纯色区域」随机展开知识点使用
 */

// ── 天文 & 宇宙物理 ───────────────────────────────────────────
const ASTRONOMY = [
  'The life cycle of a star: from stellar nebula to white dwarf or supernova',
  'Black hole accretion disk and gravitational lensing effects',
  'Formation of the Solar System from a protoplanetary disk',
  'Neutron star pulsars and magnetars — cosmic lighthouses',
  'Dark matter distribution in galaxy clusters',
  'Aurora borealis — solar wind interacting with Earth\'s magnetosphere',
  'Cosmic microwave background radiation and the Big Bang',
  'Exoplanet detection methods: transit, radial velocity, direct imaging',
  'Galactic collision: the Milky Way and Andromeda merger',
  'Gravitational waves and the merging of binary black holes',
  'The structure of a comet: nucleus, coma, and twin tails',
  'How solar flares and coronal mass ejections affect Earth',
];

// ── 地球科学 & 地质 ──────────────────────────────────────────
const EARTH_SCIENCE = [
  'Plate tectonics: subduction zones, mid-ocean ridges, and continental drift',
  'Volcanic anatomy: magma chamber, vent system, and eruption dynamics',
  'Cave formation: limestone dissolution and speleothem growth',
  'Glacier dynamics: ice flow, crevasses, and glacial erosion',
  'Deep ocean hydrothermal vents and chemosynthetic ecosystems',
  'Earthquake wave propagation and seismic tomography of Earth\'s interior',
  'Formation of diamonds under extreme pressure in Earth\'s mantle',
  'Desert sand dune migration and wind erosion patterns',
  'The formation of the Grand Canyon through millions of years of erosion',
  'Ocean current systems: thermohaline circulation and gyres',
  'Lightning formation inside cumulonimbus clouds',
  'Permafrost thaw and methane release in Arctic regions',
  'How geysers work: hydrothermal plumbing and eruption cycle',
];

// ── 生物 & 生态 ──────────────────────────────────────────────
const BIOLOGY = [
  'Bioluminescence in deep-sea anglerfish, jellyfish, and bacteria',
  'Insect metamorphosis: complete life cycle from egg to adult butterfly',
  'Mycorrhizal fungal networks connecting forest trees underground',
  'Coral reef ecosystem: symbiosis between coral polyps and zooxanthellae',
  'Migration pathways of monarch butterflies across North America',
  'Whale song acoustics and long-distance communication in the ocean',
  'Bat echolocation: ultrasonic signal generation and prey detection',
  'Cephalopod camouflage: chromatophore cells and skin pattern control',
  'Carnivorous plant trapping mechanisms: Venus flytrap, sundew, pitcher plant',
  'Bird feather microstructure: barbs, barbules, and structural iridescence',
  'Colony superorganism behavior: ant and termite nest architecture',
  'Electric eel bioelectricity generation and hunting strategy',
  'Mangrove root systems and their role in coastal protection',
  'Predator-prey population dynamics: Lotka-Volterra cycles',
  'Deep-sea gigantism and the adaptations of abyssal zone creatures',
  'The symbiosis between clownfish and sea anemones',
  'How spider silk is spun: spinneret anatomy and silk protein properties',
];

// ── 人体 & 医学 ──────────────────────────────────────────────
const MEDICINE = [
  'Human neuron anatomy and synaptic signal transmission',
  'The human immune response: T-cells, B-cells, and antibody production',
  'Heart anatomy and the cardiac cycle: blood flow through four chambers',
  'DNA replication and the molecular machinery of the replisome',
  'CRISPR-Cas9 gene editing mechanism at the molecular level',
  'How vaccines train the immune system: antigen presentation and memory cells',
  'The human eye: photoreceptor cells and visual signal processing',
  'Sleep stages and brainwave patterns: from REM to slow-wave deep sleep',
  'Cancer cell division and metastasis through the lymphatic system',
  'How anesthesia works: receptor binding and consciousness suppression',
  'The gut microbiome and its bidirectional connection to brain health',
  'Stem cell differentiation pathways and tissue regeneration',
  'How the kidney filters blood: nephron structure and ultrafiltration',
  'The lymphatic system and its role in immunity and fluid balance',
];

// ── 化学 & 材料 ──────────────────────────────────────────────
const CHEMISTRY = [
  'Crystal lattice structures: cubic, hexagonal, and diamond arrangements',
  'Polymer chain formation and cross-linking in rubber vulcanization',
  'Electrochemical cell: redox reactions in lithium-ion batteries',
  'Photosynthesis at the molecular level: light and dark reactions in chloroplasts',
  'Catalytic converter chemistry: reducing automotive emissions via redox',
  'Superconductivity and Cooper pair formation at low temperatures',
  'Glass formation: silica network structure and optical transparency',
  'Graphene atomic structure and its extraordinary electrical properties',
  'Nuclear fission chain reaction in a uranium-235 reactor core',
  'Soap bubble physics: surfactant molecules and thin-film interference colors',
  'Atmospheric chemistry: ozone creation and destruction in the stratosphere',
];

// ── 物理 & 工程 ──────────────────────────────────────────────
const PHYSICS = [
  'Quantum tunneling and its role in nuclear fusion inside the Sun',
  'Electromagnetic induction: how electric generators and transformers work',
  'Fiber optic communication: total internal reflection and data encoding',
  'Jet engine thermodynamics: Brayton cycle and turbine blade design',
  'Bridge engineering: suspension cable forces and load distribution',
  'How a transistor works: p-n junctions and electron flow control',
  'Wind turbine aerodynamics: blade lift and power generation mechanics',
  'Hydraulic systems and Pascal\'s law in heavy construction machinery',
  'Rocket propulsion: combustion chamber, nozzle expansion, and thrust',
  'The physics of sound: waveform, resonance, and cochlear hair cells',
  'How MRI works: nuclear magnetic resonance and tissue contrast imaging',
  'Magnetic levitation: Meissner effect in superconducting maglev trains',
  'Fluid dynamics: laminar vs turbulent flow, Bernoulli\'s principle',
];

// ── 数学 & 计算机科学 ────────────────────────────────────────
const MATHEMATICS = [
  'Fractal geometry in nature: Mandelbrot set, snowflakes, and coastlines',
  'Cryptography: how RSA encryption uses prime number factoring',
  'Neural network architecture: layers, weights, and backpropagation',
  'Cellular automata: Conway\'s Game of Life and emergent complexity',
  'Fast Fourier Transform and its applications in audio and image processing',
  'Chaos theory: the butterfly effect and sensitive dependence on initial conditions',
  'Sorting algorithm visualization: merge sort and quicksort comparison',
  'Topology: the Möbius strip, Klein bottle, and non-orientable surfaces',
  'Graph theory applied to network routing and internet infrastructure',
  'Fibonacci sequence and the golden ratio in plant phyllotaxis',
  'Quantum computing: qubits, superposition, and quantum gate circuits',
];

// ── 历史 & 考古 ──────────────────────────────────────────────
const HISTORY = [
  'Ancient Roman concrete: volcanic ash, seawater, and 2000-year durability',
  'Construction of the Egyptian pyramids: ramp systems and labor organization',
  'Silk Road trade network: goods, cultures, and disease transmission routes',
  'Gutenberg\'s printing press: movable type and the information revolution',
  'Medieval castle siege warfare: trebuchets, battering rams, and fortifications',
  'Ancient shipbuilding: Phoenician and Viking hull construction techniques',
  'Roman aqueduct engineering: gravity-fed water systems across mountains',
  'Terracotta Army production: bronze-casting and assembly-line manufacture',
  'Viking navigation by sun compass, stars, and ocean current reading',
  'How ancient astronomers mapped the sky without telescopes',
  'Inca stonework: precision fitting of massive stone blocks at Machu Picchu',
];

// ── 环境 & 气候 ──────────────────────────────────────────────
const ENVIRONMENT = [
  'Ozone layer depletion and recovery: CFC chemistry and the Montreal Protocol',
  'Ocean acidification and its effect on marine shell and skeleton formation',
  'Carbon cycle: CO₂ absorption by forests, oceans, and geological storage',
  'Wildfire ecology: prescribed burns, fire behavior, and forest regeneration',
  'Urban heat island effect and green infrastructure cooling solutions',
  'Wetland water filtration and hydrological cycle regulation',
  'Microplastic contamination pathway: ocean to food chain to human body',
  'Soil formation: weathering, organic matter, and the role of earthworms',
  'Mangrove deforestation and coastal erosion consequences',
];

// ── 认知科学 & 社会 ──────────────────────────────────────────
const COGNITIVE = [
  'How languages evolve: phonological change and language family trees',
  'The architecture of human memory: encoding, storage, and retrieval pathways',
  'Game theory in biology: evolutionary stable strategies and cooperation',
  'How epidemics spread: SIR model, R₀, and herd immunity thresholds',
  'The psychology of decision-making: cognitive biases and heuristics',
  'Urban traffic flow optimization and city grid evolution patterns',
  'Music theory: harmonics, overtone series, and emotional response',
  'The science of smell: olfactory receptor diversity and odor memory',
  'Mirror neurons and the neurological basis of empathy and imitation',
];

// ── 纳米科技 & 新材料 ────────────────────────────────────────
const NANOTECH = [
  'Self-healing materials: microcapsule systems and autonomic repair mechanisms',
  'Photovoltaic cell operation: semiconductor p-n junction and photon capture',
  'Origami engineering: deployable space structures inspired by paper folding',
  'Gecko adhesion: van der Waals forces in hierarchical setal micro-structures',
  'Carbon nanotube synthesis and applications in electronics and medicine',
  'Lotus effect: superhydrophobic surface micro-structures and self-cleaning',
  'Drug delivery nanoparticles: targeted therapy and blood-brain barrier crossing',
  'Piezoelectric materials: converting mechanical stress to electricity',
];

// ── 全量合并 ────────────────────────────────────────────────
export const ALL_TOPICS = [
  ...ASTRONOMY,
  ...EARTH_SCIENCE,
  ...BIOLOGY,
  ...MEDICINE,
  ...CHEMISTRY,
  ...PHYSICS,
  ...MATHEMATICS,
  ...HISTORY,
  ...ENVIRONMENT,
  ...COGNITIVE,
  ...NANOTECH,
];

/**
 * 从知识点池中随机取一条
 * @returns {string}
 */
export function pickOneTopic() {
  return ALL_TOPICS[Math.floor(Math.random() * ALL_TOPICS.length)];
}

/**
 * 从知识点池中随机取 n 条（不重复，Fisher-Yates 洗牌）
 * @param {number} n
 * @returns {string[]}
 */
export function pickTopics(n) {
  const pool = [...ALL_TOPICS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}
