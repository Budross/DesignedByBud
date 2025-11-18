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
});

// Load models sequentially to prevent overwhelming the browser
function loadModelSequentially(index) {
    if (index >= products.length) return;

    const product = products[index];
    const loadingIndicator = document.getElementById(`loading-${product.id}`);

    viewers[product.id].loadOBJ(product.modelPath)
        .then(() => {
            loadingIndicator.style.display = 'none';
            console.log(`${product.id} loaded successfully`);
            // Load next model
            loadModelSequentially(index + 1);
        })
        .catch((error) => {
            loadingIndicator.textContent = 'Failed to load model';
            loadingIndicator.style.color = '#dc3545';
            console.error(`Error loading ${product.id}:`, error);
            // Continue to next model even if this one failed
            loadModelSequentially(index + 1);
        });
}

// Start loading the first model
loadModelSequentially(0);

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

// "Why MagCase?" expandable description toggle
const whyMagcaseToggle = document.querySelector('.why-magcase-toggle');
const whyMagcasePanel = document.querySelector('.why-magcase-panel');
const magcaseDescription = document.querySelector('.magcase-description');

if (whyMagcaseToggle && whyMagcasePanel) {
    // Toggle button click handler
    whyMagcaseToggle.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default behavior
        e.stopPropagation(); // Prevent event from bubbling to document
        const isActive = whyMagcasePanel.classList.contains('active');

        if (isActive) {
            // Close panel
            whyMagcasePanel.classList.remove('active');
            whyMagcaseToggle.classList.remove('active');
        } else {
            // Open panel
            whyMagcasePanel.classList.add('active');
            whyMagcaseToggle.classList.add('active');
        }
    });

    // Click outside to close panel
    document.addEventListener('click', (e) => {
        // Check if click is outside the magcase-description container
        if (!magcaseDescription.contains(e.target) && whyMagcasePanel.classList.contains('active')) {
            whyMagcasePanel.classList.remove('active');
            whyMagcaseToggle.classList.remove('active');
        }
    });

    // Prevent clicks inside the panel from closing it
    whyMagcasePanel.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Mobile-specific: Auto-transform product cards when visible in viewport
// Detect if device is mobile/touch-enabled
const isMobileDevice = () => {
    return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(hover: none)').matches
    );
};

// Only apply intersection observer on mobile devices
if (isMobileDevice()) {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.2 // Trigger when 20% of card is visible
    };

    const cardObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Add scrolled class to trigger transformation
                entry.target.classList.add('mobile-visible');
            }
        });
    }, observerOptions);

    // Observe all product cards
    document.querySelectorAll('.product-card').forEach(card => {
        cardObserver.observe(card);
    });

    // Track touch interactions on 3D viewers to keep cards in focus
    document.querySelectorAll('.viewer-3d').forEach(viewer => {
        viewer.addEventListener('touchstart', (e) => {
            // Find the parent product card
            const card = viewer.closest('.product-card');
            if (card) {
                // Mark this card as interacted with
                card.classList.add('interacted');
            }
        });
    });
}
