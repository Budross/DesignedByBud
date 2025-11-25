/**
 * OBJ Viewer Framework
 * A simple framework for displaying .obj 3D models with interactive rotation using Three.js
 *
 * @example
 * const viewer = new OBJViewer('viewer-container', {
 *   backgroundColor: 0xf8f9fa,
 *   modelColor: 0x4a90e2,
 *   enableRotation: true
 * });
 * viewer.loadOBJ('path/to/model.obj');
 */

class OBJViewer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    // Configuration
    this.config = {
      backgroundColor: options.backgroundColor || 0xf0f0f0,
      modelColor: options.modelColor || 0x808080,
      cameraDistance: options.cameraDistance || 5,
      enableRotation: options.enableRotation !== false,
      autoRotate: options.autoRotate || false,
      autoRotateSpeed: options.autoRotateSpeed || 0.5,
      autoRotateAxis: options.autoRotateAxis || 'y',
      lightIntensity: options.lightIntensity || 1,
      initialRotation: options.initialRotation || { x: 0, y: 0, z: 0 },
      ...options
    };

    // Initialize Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.model = null;
    this.controls = {
      isDragging: false,
      previousMousePosition: { x: 0, y: 0 },
      rotationSpeed: 0.005
    };

    this.init();
  }

  /**
   * Initialize Three.js scene, camera, renderer, and controls
   */
  init() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.config.backgroundColor);

    // Create camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.z = this.config.cameraDistance;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // Add lights
    this.addLights();

    // Setup mouse controls
    if (this.config.enableRotation) {
      this.setupControls();
    }

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Watch for container size changes (e.g., when CSS loads late)
    this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
    this.resizeObserver.observe(this.container);

    // Start animation loop
    this.animate();
  }

  addLights() {
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5 * this.config.lightIntensity);
    this.scene.add(ambientLight);

    // Directional light for highlights
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8 * this.config.lightIntensity);
    directionalLight1.position.set(5, 5, 5);
    this.scene.add(directionalLight1);

    // Additional directional light from another angle
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4 * this.config.lightIntensity);
    directionalLight2.position.set(-5, 3, -5);
    this.scene.add(directionalLight2);
  }

  setupControls() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      this.controls.isDragging = true;
      this.controls.previousMousePosition = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.controls.isDragging && this.model) {
        const deltaX = e.clientX - this.controls.previousMousePosition.x;
        const deltaY = e.clientY - this.controls.previousMousePosition.y;

        this.model.rotation.y += deltaX * this.controls.rotationSpeed;
        this.model.rotation.x += deltaY * this.controls.rotationSpeed;

        this.controls.previousMousePosition = { x: e.clientX, y: e.clientY };
      }
    });

    canvas.addEventListener('mouseup', () => {
      this.controls.isDragging = false;
      canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('mouseleave', () => {
      this.controls.isDragging = false;
      canvas.style.cursor = 'grab';
    });

    // Touch support for mobile
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.controls.isDragging = true;
        this.controls.previousMousePosition = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };
        // Prevent page scrolling when touching the 3D viewer on mobile
        e.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (this.controls.isDragging && this.model && e.touches.length === 1) {
        // Prevent page scrolling during 3D model interaction on mobile
        e.preventDefault();

        const deltaX = e.touches[0].clientX - this.controls.previousMousePosition.x;
        const deltaY = e.touches[0].clientY - this.controls.previousMousePosition.y;

        this.model.rotation.y += deltaX * this.controls.rotationSpeed;
        this.model.rotation.x += deltaY * this.controls.rotationSpeed;

        this.controls.previousMousePosition = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      this.controls.isDragging = false;
    });

    canvas.style.cursor = 'grab';
  }

  /**
   * Load an OBJ 3D model file
   * @param {string} objPath - Path to the .obj file
   * @param {string|null} mtlPath - Optional path to .mtl material file
   * @param {Function|null} onProgress - Optional progress callback
   * @returns {Promise} Resolves when model is loaded
   */
  loadOBJ(objPath, mtlPath = null, onProgress = null) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.OBJLoader();

      // If MTL file is provided, load materials first
      if (mtlPath) {
        const mtlLoader = new THREE.MTLLoader();
        mtlLoader.load(
          mtlPath,
          (materials) => {
            materials.preload();
            loader.setMaterials(materials);
            this.loadModel(loader, objPath, onProgress, resolve, reject);
          },
          onProgress,
          reject
        );
      } else {
        this.loadModel(loader, objPath, onProgress, resolve, reject);
      }
    });
  }

  loadModel(loader, objPath, onProgress, resolve, reject) {
    loader.load(
      objPath,
      (object) => {
        // Remove existing model if any
        if (this.model) {
          this.scene.remove(this.model);
        }

        // Apply default material if no MTL was loaded
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (!child.material || !child.material.map) {
              child.material = new THREE.MeshPhongMaterial({
                color: this.config.modelColor,
                shininess: 30
              });
            }
          }
        });

        // Calculate bounding box and center before scaling
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Center the object's position so it rotates around its center
        object.position.sub(center);

        // Create inner group for initial rotation (static, never changes)
        const innerGroup = new THREE.Group();
        innerGroup.add(object);

        // Scale the inner group to fit the view
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        innerGroup.scale.multiplyScalar(scale);

        // Apply initial rotation to inner group (this stays fixed)
        if (this.config.initialRotation) {
          innerGroup.rotation.x = this.config.initialRotation.x || 0;
          innerGroup.rotation.y = this.config.initialRotation.y || 0;
          innerGroup.rotation.z = this.config.initialRotation.z || 0;
        }

        // Create outer group for user/auto rotations (always in world space)
        const outerGroup = new THREE.Group();
        outerGroup.add(innerGroup);

        // The outer group is what we'll rotate for user interactions
        // This ensures rotations always happen in screen/world space
        this.model = outerGroup;
        this.scene.add(this.model);

        resolve(outerGroup);
      },
      onProgress,
      reject
    );
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Auto-rotate if enabled
    if (this.config.autoRotate && this.model && !this.controls.isDragging) {
      const rotationAmount = this.config.autoRotateSpeed * 0.01;

      // Rotate around the configured axis in world space (not local space)
      // This ensures rotation happens around global axes regardless of initial rotation
      let axis;
      switch (this.config.autoRotateAxis) {
        case 'x':
          axis = new THREE.Vector3(1, 0, 0); // Global X axis
          break;
        case 'y':
          axis = new THREE.Vector3(0, 1, 0); // Global Y axis (world up)
          break;
        case 'z':
          axis = new THREE.Vector3(0, 0, 1); // Global Z axis
          break;
        default:
          axis = new THREE.Vector3(0, 1, 0); // Default to global Y axis
      }
      this.model.rotateOnWorldAxis(axis, rotationAmount);
    }

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  setBackgroundColor(color) {
    this.scene.background = new THREE.Color(color);
  }

  /**
   * Reset the model rotation to initial state
   */
  resetRotation() {
    if (this.model) {
      // Reset only the outer group's rotation (user/auto rotations)
      // This preserves the initial rotation in the inner group
      this.model.rotation.set(0, 0, 0);
    }
  }

  dispose() {
    // Clean up resources
    window.removeEventListener('resize', this.onWindowResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.model) {
      this.scene.remove(this.model);
    }
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
