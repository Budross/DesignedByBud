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
        color: 0x2c2c2c,
        initialRotation: { x: -Math.PI/4, y: 0, z: -Math.PI/4 },
        autoRotateAxis: 'y'
    },
    {
        id: 'weighted-50card',
        viewerId: 'viewer-weighted-50card',
        modelPath: 'products/Weighted-Base 50-Card Organizer.obj',
        color: 0x2c2c2c,
        initialRotation: { x: -Math.PI/4, y: 0, z: -Math.PI/4 },
        autoRotateAxis: 'y'
    },
    {
        id: 'modular-stand',
        viewerId: 'viewer-modular-stand',
        modelPath: 'products/MagCase Modular Stand.obj',
        color: 0x2c2c2c,
        initialRotation: { x: -Math.PI/4, y: 0, z: -Math.PI/4 },
        autoRotateAxis: 'y'
    }
];

// Store viewer instances
const viewers = {};

// Track loading state for each product
const loadingState = {};

// Expected height from CSS (product-card.css defines .viewer-3d height: 280px)
const EXPECTED_VIEWER_HEIGHT = 280;
const EXPECTED_VIEWER_HEIGHT_MOBILE = 250; // Mobile breakpoint uses 250px

/**
 * Get the expected viewer height based on current viewport
 * CSS breakpoints: 280px default, 250px at max-width: 768px
 */
function getExpectedViewerHeight() {
    return window.innerWidth <= 768 ? EXPECTED_VIEWER_HEIGHT_MOBILE : EXPECTED_VIEWER_HEIGHT;
}

/**
 * Check if CSS has been fully applied by verifying computed styles
 * More strict checking than before - requires exact expected height
 */
function isCSSApplied() {
    const viewerElements = document.querySelectorAll('.viewer-3d');

    if (viewerElements.length === 0) {
        return false;
    }

    // Check the first viewer element's actual rendered height
    const firstViewer = viewerElements[0];
    const height = firstViewer.clientHeight;
    const expectedHeight = getExpectedViewerHeight();

    // Check if height matches expected value (allow 5px tolerance for rounding)
    return height >= expectedHeight - 5;
}

/**
 * Wait for CSS to be fully applied to the DOM
 * Uses requestAnimationFrame for proper synchronization with browser rendering
 */
function waitForCSSApplication(callback, maxAttempts = 60) {
    let attempts = 0;

    function checkCSS() {
        attempts++;

        const viewerElements = document.querySelectorAll('.viewer-3d');
        if (viewerElements.length === 0) {
            if (attempts >= maxAttempts) {
                console.warn('CSS application timeout - no viewer elements found');
                callback();
            } else {
                requestAnimationFrame(checkCSS);
            }
            return;
        }

        const firstViewer = viewerElements[0];
        const height = firstViewer.clientHeight;
        const expectedHeight = getExpectedViewerHeight();

        if (height >= expectedHeight - 5) {
            console.log(`CSS applied successfully after ${attempts} frames (height: ${height}px, expected: ${expectedHeight}px)`);
            callback();
        } else if (attempts >= maxAttempts) {
            console.warn(`CSS application timeout after ${attempts} frames - height is ${height}px, expected ${expectedHeight}px. Initializing anyway.`);
            callback();
        } else {
            // Use requestAnimationFrame for each check - syncs with browser paint cycle
            requestAnimationFrame(checkCSS);
        }
    }

    // Force a reflow to ensure any pending style calculations are processed
    document.body.offsetHeight;

    // Start checking on next animation frame
    requestAnimationFrame(checkCSS);
}

// Initialize all product viewers - wrapped in function to call after CSS loads
function initializeViewers() {
    console.log('Initializing 3D viewers after CSS layout...');

    products.forEach(product => {
        // Validate container dimensions before initializing Three.js
        const container = document.getElementById(product.viewerId);
        if (container) {
            const width = container.clientWidth;
            const height = container.clientHeight;
            const computedHeight = window.getComputedStyle(container).height;
            console.log(`${product.id} container dimensions: ${width}x${height} (computed: ${computedHeight})`);

            if (width === 0 || height === 0) {
                console.error(`ERROR: ${product.id} container has zero dimensions! CSS not applied correctly.`);
            }
        }

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

    console.log('All 3D viewers initialized successfully');

    // Force resize all viewers after a short delay to catch any missed layout calculations
    // This is a safety net for edge cases where dimensions weren't fully computed
    setTimeout(() => {
        let resizeNeeded = false;
        Object.keys(viewers).forEach(viewerId => {
            const viewer = viewers[viewerId];
            const container = viewer.container;
            const canvas = viewer.renderer.domElement;

            // Check if canvas dimensions match container dimensions
            if (canvas.width !== container.clientWidth * window.devicePixelRatio ||
                canvas.height !== container.clientHeight * window.devicePixelRatio) {
                resizeNeeded = true;
                viewer.onWindowResize();
                console.log(`Resized ${viewerId} canvas to match container`);
            }
        });

        if (resizeNeeded) {
            console.log('Post-initialization resize completed');
        }
    }, 100);

    // Additional resize check after fonts and other resources fully load
    if (document.readyState !== 'complete') {
        window.addEventListener('load', () => {
            setTimeout(() => {
                Object.values(viewers).forEach(viewer => {
                    viewer.onWindowResize();
                });
                console.log('Post-load resize completed');
            }, 50);
        });
    }

    // After viewers are initialized, set up controls
    initializeViewerControls();
}

// Wait for deferred CSS to load AND be applied before initializing viewers
if (window.waitForDeferredCSS) {
    window.waitForDeferredCSS(() => {
        // CSS file is loaded, now wait for browser to parse and apply styles
        console.log('Deferred CSS loaded, waiting for styles to be applied...');

        // Use requestAnimationFrame to wait for next paint cycle
        requestAnimationFrame(() => {
            // Force a reflow before checking
            document.body.offsetHeight;

            // Then poll for CSS application using animation frames
            waitForCSSApplication(initializeViewers);
        });
    });
} else {
    // Fallback if deferred CSS system isn't available
    // Wait for DOMContentLoaded + layout calculation
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            requestAnimationFrame(() => {
                waitForCSSApplication(initializeViewers);
            });
        });
    } else {
        requestAnimationFrame(() => {
            waitForCSSApplication(initializeViewers);
        });
    }
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
