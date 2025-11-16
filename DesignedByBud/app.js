// Product configurations
const products = [
    {
        id: 'magcase',
        viewerId: 'viewer-magcase',
        modelPath: 'products/MagCase.obj',
        color: 0x4a90e2,
        initialRotation: { x: Math.PI/6, y: -Math.PI/4, z: 0 },
        autoRotateAxis: 'y'
    },
    {
        id: 'weighted-magcase',
        viewerId: 'viewer-weighted-magcase',
        modelPath: 'products/Weighted-Base MagCase Organizer.obj',
        color: 0x2ecc71,
        initialRotation: { x: -Math.PI/4, y: 0, z: -Math.PI/4 },
        autoRotateAxis: 'y'
    },
    {
        id: 'weighted-50card',
        viewerId: 'viewer-weighted-50card',
        modelPath: 'products/Weighted-Base 50-Card Organizer.obj',
        color: 0xe74c3c,
        initialRotation: { x: -Math.PI/4, y: 0, z: -Math.PI/4 },
        autoRotateAxis: 'y'
    },
    {
        id: 'modular-stand',
        viewerId: 'viewer-modular-stand',
        modelPath: 'products/MagCase Modular Stand.obj',
        color: 0x9b59b6,
        initialRotation: { x: -Math.PI/4, y: 0, z: -Math.PI/4 },
        autoRotateAxis: 'y'
    }
];

// Store viewer instances
const viewers = {};

// Initialize all product viewers
products.forEach(product => {
    viewers[product.id] = new OBJViewer(product.viewerId, {
        backgroundColor: 0xf8f9fa,
        modelColor: product.color,
        enableRotation: true,
        autoRotate: false,
        autoRotateSpeed: 0.3,
        autoRotateAxis: product.autoRotateAxis,
        lightIntensity: 1,
        initialRotation: product.initialRotation
    });

    const loadingIndicator = document.getElementById(`loading-${product.id}`);

    viewers[product.id].loadOBJ(product.modelPath)
        .then(() => {
            loadingIndicator.style.display = 'none';
            console.log(`${product.id} loaded successfully`);
        })
        .catch((error) => {
            loadingIndicator.textContent = 'Failed to load model';
            loadingIndicator.style.color = '#dc3545';
            console.error(`Error loading ${product.id}:`, error);
        });
});

// Setup auto-rotate toggles
document.querySelectorAll('.auto-rotate').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
        const viewerId = e.target.dataset.viewer;
        viewers[viewerId].config.autoRotate = e.target.checked;
    });
});

// Setup reset buttons
document.querySelectorAll('.reset-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const viewerId = e.target.dataset.viewer;
        viewers[viewerId].resetRotation();
    });
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
