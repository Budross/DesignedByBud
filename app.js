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

// Store viewer instances (created on-demand when models load)
const viewers = {};

// Track loading state for each product
const loadingState = {};

// Initialize loading state for all products
products.forEach(product => {
    loadingState[product.id] = {
        requested: false,
        loaded: false
    };
});

// LocalStorage keys
const STORAGE_KEYS = {
    AUTO_ROTATE_PREFIX: 'autoRotate_',
    MAGCASE_PANEL_OPEN: 'magcasePanelOpen'
};

/**
 * Create an OBJViewer instance for a product
 * Called on-demand when the product card enters the viewport
 */
function createViewer(product) {
    const container = document.getElementById(product.viewerId);
    
    if (!container) {
        console.error(`Container not found for ${product.id}`);
        return null;
    }

    // Log dimensions for debugging
    const width = container.clientWidth;
    const height = container.clientHeight;
    console.log(`Creating viewer for ${product.id}: ${width}x${height}`);

    if (height < 100) {
        console.warn(`Warning: ${product.id} container height is ${height}px - CSS may not be fully applied`);
    }

    // Check for saved auto-rotate preference
    const storageKey = STORAGE_KEYS.AUTO_ROTATE_PREFIX + product.id;
    const savedAutoRotate = localStorage.getItem(storageKey);
    const autoRotate = savedAutoRotate === 'true';

    const viewer = new OBJViewer(product.viewerId, {
        backgroundColor: 0xf8f9fa,
        modelColor: product.color,
        enableRotation: true,
        autoRotate: autoRotate,
        autoRotateSpeed: 0.3,
        autoRotateAxis: product.autoRotateAxis,
        lightIntensity: 1,
        initialRotation: product.initialRotation
    });

    // Update checkbox state to match saved preference
    const checkbox = document.querySelector(`.auto-rotate[data-viewer="${product.id}"]`);
    if (checkbox) {
        checkbox.checked = autoRotate;
    }

    return viewer;
}

/**
 * Load a specific model
 * Creates the OBJViewer instance on-demand if it doesn't exist
 */
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

    // Create the viewer NOW - at this point the card is visible
    // and CSS is definitely applied since the user can see the card
    if (!viewers[product.id]) {
        viewers[product.id] = createViewer(product);
        
        if (!viewers[product.id]) {
            state.requested = false;
            return Promise.reject('Failed to create viewer');
        }
    }

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

/**
 * Setup lazy loading using Intersection Observer
 * Models (and their viewers) are only created when cards enter the viewport
 */
function setupLazyLoading() {
    const observerOptions = {
        root: null,
        rootMargin: '100px', // Start loading slightly before entering viewport
        threshold: 0.1 // Trigger when 10% of viewer is visible
    };

    const modelObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const viewerId = entry.target.id;
                const product = products.find(p => p.viewerId === viewerId);

                if (product && !loadingState[product.id].requested) {
                    console.log(`Loading ${product.id} (entered viewport)`);
                    loadModel(product.id);
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

/**
 * Initialize controls for viewers
 * Sets up event listeners for auto-rotate checkboxes and reset buttons
 */
function initializeControls() {
    // Setup auto-rotate toggles
    document.querySelectorAll('.auto-rotate').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const viewerId = e.target.dataset.viewer;
            const isChecked = e.target.checked;

            // Update viewer if it exists
            if (viewers[viewerId]) {
                viewers[viewerId].config.autoRotate = isChecked;
            }

            // Save preference to localStorage (persists even before viewer is created)
            const storageKey = STORAGE_KEYS.AUTO_ROTATE_PREFIX + viewerId;
            localStorage.setItem(storageKey, isChecked.toString());
            console.log(`Saved auto-rotate preference for ${viewerId}: ${isChecked}`);
        });
    });

    // Restore checkbox states from localStorage
    document.querySelectorAll('.auto-rotate').forEach(checkbox => {
        const viewerId = checkbox.dataset.viewer;
        const storageKey = STORAGE_KEYS.AUTO_ROTATE_PREFIX + viewerId;
        const savedState = localStorage.getItem(storageKey);

        if (savedState !== null) {
            checkbox.checked = savedState === 'true';
        }
    });

    // Setup reset buttons
    document.querySelectorAll('.reset-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const viewerId = e.target.dataset.viewer;
            if (viewers[viewerId]) {
                viewers[viewerId].resetRotation();
            }
        });
    });
}

/**
 * Main initialization
 * Sets up controls and lazy loading - viewers are created on-demand
 */
function initialize() {
    console.log('Initializing application...');
    
    // Setup UI controls (these work independently of viewers)
    initializeControls();
    
    // Setup lazy loading for 3D models
    setupLazyLoading();
    
    console.log('Application initialized - viewers will be created on-demand');
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
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
        e.preventDefault();
        e.stopPropagation();
        const isActive = whyMagcasePanel.classList.contains('active');

        if (isActive) {
            whyMagcasePanel.classList.remove('active');
            whyMagcaseToggle.classList.remove('active');
            localStorage.setItem(STORAGE_KEYS.MAGCASE_PANEL_OPEN, 'false');
        } else {
            whyMagcasePanel.classList.add('active');
            whyMagcaseToggle.classList.add('active');
            localStorage.setItem(STORAGE_KEYS.MAGCASE_PANEL_OPEN, 'true');
        }
    });

    // Click outside to close panel
    document.addEventListener('click', (e) => {
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
const isMobileDevice = () => {
    return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(hover: none)').matches
    );
};

if (isMobileDevice()) {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.2
    };

    const cardObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('mobile-visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.product-card').forEach(card => {
        cardObserver.observe(card);
    });

    document.querySelectorAll('.viewer-3d').forEach(viewer => {
        viewer.addEventListener('touchstart', (e) => {
            const card = viewer.closest('.product-card');
            if (card) {
                card.classList.add('interacted');
            }
        });
    });
}
