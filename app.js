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

// Track loading state for each product
const loadingState = {};

// Initialize all product viewers - wrapped in function to call after CSS loads
function initializeViewers() {
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

        // Initialize loading state
        loadingState[product.id] = {
            requested: false,
            loaded: false
        };
    });

    // After viewers are initialized, set up controls
    initializeViewerControls();
}

// Wait for deferred CSS to load before initializing viewers
if (window.waitForDeferredCSS) {
    window.waitForDeferredCSS(initializeViewers);
} else {
    // Fallback if deferred CSS system isn't available
    initializeViewers();
}

// Load a specific model
function loadModel(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return Promise.reject('Product not found');

    const state = loadingState[productId];

    // Prevent duplicate load attempts
    if (state.requested) {
        return Promise.resolve();
    }

    state.requested = true;
    const loadingIndicator = document.getElementById(`loading-${product.id}`);

    return viewers[product.id].loadOBJ(product.modelPath)
        .then(() => {
            loadingIndicator.style.display = 'none';
            state.loaded = true;
            console.log(`${product.id} loaded successfully`);
        })
        .catch((error) => {
            loadingIndicator.textContent = 'Failed to load model';
            loadingIndicator.style.color = '#dc3545';
            console.error(`Error loading ${product.id}:`, error);
            state.loaded = false;
            state.requested = false; // Allow retry on error
        });
}

// Lazy load models using Intersection Observer
function setupLazyLoading() {
    const observerOptions = {
        root: null,
        rootMargin: '100px', // Start loading slightly before entering viewport
        threshold: 0.1 // Trigger when 10% of viewer is visible
    };

    const modelObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Find the product ID from the viewer element
                const viewerId = entry.target.id;
                const product = products.find(p => p.viewerId === viewerId);

                if (product && !loadingState[product.id].requested) {
                    console.log(`Loading ${product.id} (entered viewport)`);
                    loadModel(product.id);
                    // Stop observing once loading is triggered
                    modelObserver.unobserve(entry.target);
                }
            }
        });
    }, observerOptions);

    // Observe all viewer containers
    products.forEach(product => {
        const viewerElement = document.getElementById(product.viewerId);
        if (viewerElement) {
            modelObserver.observe(viewerElement);
        }
    });
}

// Initialize lazy loading after page resources are loaded
function initializeDeferredLoading() {
    // Wait for page load to complete (images, fonts, CSS)
    if (document.readyState === 'complete') {
        setupLazyLoading();
    } else {
        window.addEventListener('load', setupLazyLoading);
    }
}

// LocalStorage keys
const STORAGE_KEYS = {
    AUTO_ROTATE_PREFIX: 'autoRotate_',
    MAGCASE_PANEL_OPEN: 'magcasePanelOpen'
};

// Initialize viewer controls - called after viewers are created
function initializeViewerControls() {
    // Restore auto-rotate preferences from localStorage
    function restoreAutoRotatePreferences() {
        document.querySelectorAll('.auto-rotate').forEach(checkbox => {
            const viewerId = checkbox.dataset.viewer;
            const storageKey = STORAGE_KEYS.AUTO_ROTATE_PREFIX + viewerId;
            const savedState = localStorage.getItem(storageKey);

            if (savedState !== null) {
                const isChecked = savedState === 'true';
                checkbox.checked = isChecked;
                if (viewers[viewerId]) {
                    viewers[viewerId].config.autoRotate = isChecked;
                }
            }
        });
    }

    // Setup auto-rotate toggles
    document.querySelectorAll('.auto-rotate').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const viewerId = e.target.dataset.viewer;
            const isChecked = e.target.checked;

            // Update viewer
            viewers[viewerId].config.autoRotate = isChecked;

            // Save preference to localStorage
            const storageKey = STORAGE_KEYS.AUTO_ROTATE_PREFIX + viewerId;
            localStorage.setItem(storageKey, isChecked.toString());
            console.log(`Saved auto-rotate preference for ${viewerId}: ${isChecked}`);
        });
    });

    // Restore preferences on page load
    restoreAutoRotatePreferences();

    // Setup reset buttons
    document.querySelectorAll('.reset-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const viewerId = e.target.dataset.viewer;
            viewers[viewerId].resetRotation();
        });
    });

    // Start the deferred loading process for 3D models
    initializeDeferredLoading();
}

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
    // Restore panel state from localStorage
    const savedPanelState = localStorage.getItem(STORAGE_KEYS.MAGCASE_PANEL_OPEN);
    if (savedPanelState === 'true') {
        whyMagcasePanel.classList.add('active');
        whyMagcaseToggle.classList.add('active');
    }

    // Toggle button click handler
    whyMagcaseToggle.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default behavior
        e.stopPropagation(); // Prevent event from bubbling to document
        const isActive = whyMagcasePanel.classList.contains('active');

        if (isActive) {
            // Close panel
            whyMagcasePanel.classList.remove('active');
            whyMagcaseToggle.classList.remove('active');
            localStorage.setItem(STORAGE_KEYS.MAGCASE_PANEL_OPEN, 'false');
        } else {
            // Open panel
            whyMagcasePanel.classList.add('active');
            whyMagcaseToggle.classList.add('active');
            localStorage.setItem(STORAGE_KEYS.MAGCASE_PANEL_OPEN, 'true');
        }
    });

    // Click outside to close panel
    document.addEventListener('click', (e) => {
        // Check if click is outside the magcase-description container
        if (!magcaseDescription.contains(e.target) && whyMagcasePanel.classList.contains('active')) {
            whyMagcasePanel.classList.remove('active');
            whyMagcaseToggle.classList.remove('active');
            localStorage.setItem(STORAGE_KEYS.MAGCASE_PANEL_OPEN, 'false');
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
