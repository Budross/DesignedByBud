/**
 * OBJ Viewer Framework - Enhanced Version
 * A framework for displaying .obj 3D models with interactive rotation using Three.js
 * 
 * OPTIMIZED FOR PRODUCT CARD INTEGRATION:
 * - Respects parent container dimensions (product cards)
 * - Handles CSS-based container resizing gracefully
 * - Touch-optimized for mobile card interactions
 * - Memory-efficient cleanup
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
      assembledModelColor: options.assembledModelColor || options.modelColor || 0x808080,
      cameraDistance: options.cameraDistance || 5,
      enableRotation: options.enableRotation !== false,
      autoRotate: options.autoRotate || false,
      autoRotateSpeed: options.autoRotateSpeed || 0.5,
      autoRotateAxis: options.autoRotateAxis || 'y',
      lightIntensity: options.lightIntensity || 1,
      initialRotation: options.initialRotation || { x: 0, y: 0, z: 0 },
      shelfColor: options.shelfColor || 0x8B4513,
      shelfVisible: options.shelfVisible || false,
      ...options
    };

    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.model = null;
    this.assembledModel = null;
    this.shelf = null;
    this.directionalLight = null;
    
    // Control state management
    this.controls = {
      isDragging: false,
      previousMousePosition: { x: 0, y: 0 },
      rotationSpeed: 0.005
    };

    // Camera orbital controls (always enabled to prevent model overlap)
    this.orbitalControls = {
      enabled: false, // Set to true in init()
      radius: this.config.cameraDistance,
      theta: 0, // Horizontal rotation angle
      phi: Math.PI / 2, // 90° = horizontal view (matches old camera.position.z behavior)
      target: new THREE.Vector3(0, 0, 0), // Look at center by default
      minPhi: Math.PI / 12, // Allow almost top-down view
      maxPhi: Math.PI - Math.PI / 12, // Allow almost bottom-up view
      rotationSensitivity: 0.005
    };

    // Store original product position for shelf toggle
    this.productOriginalY = 0;
    this.productBoundingBox = null;
    this.assembledOriginalY = 0;
    this.assembledOriginalZ = 0;

    // Assembled view configuration
    this.assembledViewConfig = {
      enabled: false,
      yOffset: 0.55, // How much higher the assembled model sits above the stand
      zOffset: 0.1  // How far back from camera (negative = away, positive = toward)
    };

    // Animation frame ID for cleanup
    this.animationFrameId = null;

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

    // Initialize orbital camera controls for all viewers
    // This prevents model overlap when rotating - camera orbits instead of models rotating
    this.enableOrbitalCamera();

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2 for performance
    this.renderer.shadowMap.enabled = false; // Initially disabled, enabled when shelf is shown
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows for better quality
    this.container.appendChild(this.renderer.domElement);

    // Add lights
    this.addLights();

    // Create shelf
    this.createShelf();

    // Setup mouse controls
    if (this.config.enableRotation) {
      this.setupControls();
    }

    // Handle window resize
    this.resizeHandler = () => this.onWindowResize();
    window.addEventListener('resize', this.resizeHandler);

    // Start animation loop
    this.animate();
  }

  /**
   * Add three-point lighting setup
   */
  addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5 * this.config.lightIntensity);
    this.scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8 * this.config.lightIntensity);
    directionalLight1.position.set(5, 5, 5);
    directionalLight1.castShadow = this.config.shelfVisible; // Only cast shadows when shelf is visible
    directionalLight1.shadow.mapSize.width = 1024; // Shadow resolution
    directionalLight1.shadow.mapSize.height = 1024;
    directionalLight1.shadow.camera.left = -5;
    directionalLight1.shadow.camera.right = 5;
    directionalLight1.shadow.camera.top = 5;
    directionalLight1.shadow.camera.bottom = -5;
    directionalLight1.shadow.camera.near = 0.5;
    directionalLight1.shadow.camera.far = 20;
    this.directionalLight = directionalLight1; // Store reference for shadow control
    this.scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4 * this.config.lightIntensity);
    directionalLight2.position.set(-5, 3, -5);
    this.scene.add(directionalLight2);
  }

  /**
   * Create a simple shelf for product display
   */
  createShelf() {
    const shelfGroup = new THREE.Group();

    // Main shelf surface (20 units wide)
    const shelfGeometry = new THREE.BoxGeometry(20, 0.15, 2.5);
    const shelfMaterial = new THREE.MeshPhongMaterial({
      color: this.config.shelfColor,
      shininess: 20
    });
    const shelfSurface = new THREE.Mesh(shelfGeometry, shelfMaterial);
    shelfSurface.position.y = -1.5;
    shelfSurface.receiveShadow = true; // Allow shelf to receive shadows
    shelfSurface.castShadow = true; // Cast shadow on wall to prevent light bleeding through
    shelfGroup.add(shelfSurface);

    // Front edge (20 units wide)
    const edgeGeometry = new THREE.BoxGeometry(20, 0.08, 0.1);
    const edgeMaterial = new THREE.MeshPhongMaterial({
      color: this.config.shelfColor * 0.8,
      shininess: 20
    });
    const frontEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    frontEdge.position.set(0, -1.54, 1.3);
    shelfGroup.add(frontEdge);

    // Support brackets (adjusted positions for wider shelf)
    const bracketGeometry = new THREE.BoxGeometry(0.15, 0.8, 2);
    const bracketMaterial = new THREE.MeshPhongMaterial({
      color: this.config.shelfColor * 0.8,
      shininess: 20
    });

    const leftBracket = new THREE.Mesh(bracketGeometry, bracketMaterial);
    leftBracket.position.set(-9, -2, 0);
    shelfGroup.add(leftBracket);

    const rightBracket = new THREE.Mesh(bracketGeometry, bracketMaterial);
    rightBracket.position.set(9, -2, 0);
    shelfGroup.add(rightBracket);

    // Back wall (aligned with back of shelf)
    const wallGeometry = new THREE.BoxGeometry(20, 6, 0.2);
    const wallMaterial = new THREE.MeshPhongMaterial({
      color: 0xE5E5E5, // Neutral light gray color
      shininess: 10
    });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(0, -0.5, -1.25); // At back edge of shelf, centered vertically
    wall.receiveShadow = true; // Allow wall to receive shadows
    shelfGroup.add(wall);

    this.shelf = shelfGroup;
    this.shelf.visible = this.config.shelfVisible;
    this.scene.add(this.shelf);

    if (this.config.shelfVisible) {
      this.enableOrbitalCamera();
    }
  }

  /**
   * Setup interaction controls with improved touch support
   */
  setupControls() {
    const canvas = this.renderer.domElement;

    // Mouse events
    const onMouseDown = (e) => {
      this.controls.isDragging = true;
      this.controls.previousMousePosition = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      if (this.controls.isDragging) {
        const deltaX = e.clientX - this.controls.previousMousePosition.x;
        const deltaY = e.clientY - this.controls.previousMousePosition.y;

        // Always use orbital camera to prevent model overlap when rotating
        this.updateOrbitalCamera(deltaX, deltaY);

        this.controls.previousMousePosition = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseUp = () => {
      this.controls.isDragging = false;
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);

    // Touch support - prevents page scrolling while rotating
    let touchStartPos = { x: 0, y: 0 };

    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        e.preventDefault(); // Prevent page scroll
        this.controls.isDragging = true;
        touchStartPos = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };
        this.controls.previousMousePosition = touchStartPos;
      }
    };

    const onTouchMove = (e) => {
      if (this.controls.isDragging && e.touches.length === 1) {
        e.preventDefault(); // Prevent page scroll
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.controls.previousMousePosition.x;
        const deltaY = touch.clientY - this.controls.previousMousePosition.y;

        // Always use orbital camera to prevent model overlap when rotating
        this.updateOrbitalCamera(deltaX, deltaY);

        this.controls.previousMousePosition = {
          x: touch.clientX,
          y: touch.clientY
        };
      }
    };

    const onTouchEnd = () => {
      this.controls.isDragging = false;
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    // Store references for cleanup
    this.eventHandlers = {
      onMouseDown, onMouseMove, onMouseUp,
      onTouchStart, onTouchMove, onTouchEnd
    };

    canvas.style.cursor = 'grab';
  }

  /**
   * Update orbital camera position based on mouse/touch delta
   */
  updateOrbitalCamera(deltaX, deltaY) {
    this.orbitalControls.theta -= deltaX * this.orbitalControls.rotationSensitivity;
    this.orbitalControls.phi += deltaY * this.orbitalControls.rotationSensitivity;

    this.orbitalControls.phi = Math.max(
      this.orbitalControls.minPhi,
      Math.min(this.orbitalControls.maxPhi, this.orbitalControls.phi)
    );

    this.updateCameraPosition();
  }

  /**
   * Update camera position from spherical coordinates
   */
  updateCameraPosition() {
    const { radius, theta, phi, target } = this.orbitalControls;

    this.camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    this.camera.position.y = target.y + radius * Math.cos(phi);
    this.camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);

    this.camera.lookAt(target);
  }

  /**
   * Enable orbital camera mode
   */
  enableOrbitalCamera() {
    this.orbitalControls.enabled = true;
    this.updateCameraPosition();
  }

  /**
   * Disable orbital camera mode
   */
  disableOrbitalCamera() {
    this.orbitalControls.enabled = false;
    this.camera.position.set(0, 0, this.config.cameraDistance);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * Position product on shelf surface
   */
  positionProductOnShelf() {
    if (!this.model || !this.shelf) return;

    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());

    const shelfTopY = -1.425;
    const productBottomOffset = -size.y / 2;

    this.productOriginalY = this.model.position.y;
    const newY = shelfTopY - productBottomOffset;
    const yDelta = newY - this.model.position.y;

    this.model.position.y = newY;
    this.productBoundingBox = size;

    // Also adjust assembled model position to maintain offset
    if (this.assembledModel) {
      this.assembledModel.position.y += yDelta;
    }
  }

  /**
   * Reset product to original position
   */
  resetProductPosition() {
    if (!this.model) return;

    this.model.position.y = this.productOriginalY;

    // Explicitly restore assembled model to original position
    if (this.assembledModel) {
      this.assembledModel.position.y = this.assembledOriginalY;
      this.assembledModel.position.z = this.assembledOriginalZ;
    }
  }

  /**
   * Toggle assembled view visibility
   */
  setAssembledVisible(visible) {
    if (!this.assembledModel) return;

    this.assembledModel.visible = visible;
    this.assembledViewConfig.enabled = visible;
  }

  /**
   * Toggle shelf visibility
   */
  setShelfVisible(visible) {
    if (!this.shelf) return;

    const wasVisible = this.shelf.visible;
    this.shelf.visible = visible;
    this.config.shelfVisible = visible;

    // Enable/disable shadows based on shelf visibility
    this.renderer.shadowMap.enabled = visible;

    // Toggle shadow casting on the directional light
    if (this.directionalLight) {
      this.directionalLight.castShadow = visible;
    }

    // Toggle shadow properties on all meshes in the model
    if (this.model) {
      this.model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = visible;
          child.receiveShadow = visible;
        }
      });
    }

    if (wasVisible !== visible) {
      if (visible) {
        this.resetRotation();
        this.positionProductOnShelf();
        // Adjust camera target to look at shelf (lower viewpoint)
        this.orbitalControls.target.set(0, -0.5, 0);
        this.updateCameraPosition();
      } else {
        this.resetRotation();
        this.resetProductPosition();
        // Reset camera target to center
        this.orbitalControls.target.set(0, 0, 0);
        this.updateCameraPosition();
      }
    }
  }

  /**
   * Update shelf color
   */
  setShelfColor(color) {
    if (!this.shelf) return;

    const hexColor = typeof color === 'string' ? parseInt(color.replace('#', '0x')) : color;
    
    this.shelf.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material.color.setHex(hexColor);
      }
    });
  }

  /**
   * Load an OBJ 3D model file
   */
  loadOBJ(objPath, mtlPath = null, onProgress = null) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.OBJLoader();

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

  /**
   * Load assembled view model (second OBJ file to display above the main model)
   */
  loadAssembledModel(objPath, mtlPath = null, onProgress = null) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.OBJLoader();

      if (mtlPath) {
        const mtlLoader = new THREE.MTLLoader();
        mtlLoader.load(
          mtlPath,
          (materials) => {
            materials.preload();
            loader.setMaterials(materials);
            this.loadAssembledModelInternal(loader, objPath, onProgress, resolve, reject);
          },
          onProgress,
          reject
        );
      } else {
        this.loadAssembledModelInternal(loader, objPath, onProgress, resolve, reject);
      }
    });
  }

  /**
   * Internal method to load and process assembled OBJ model
   */
  loadAssembledModelInternal(loader, objPath, onProgress, resolve, reject) {
    loader.load(
      objPath,
      (object) => {
        if (this.assembledModel) {
          this.scene.remove(this.assembledModel);
        }

        // Apply default material (use assembledModelColor for assembled model)
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (!child.material || !child.material.map) {
              child.material = new THREE.MeshPhongMaterial({
                color: this.config.assembledModelColor,
                shininess: 30
              });
            }
            // Enable shadows on assembled model
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Calculate bounding box and center
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Center the object
        object.position.sub(center);

        // Create inner group for initial rotation and scaling
        const innerGroup = new THREE.Group();
        innerGroup.add(object);

        // Scale to match main model
        if (this.config.useRealWorldScale) {
          const globalScale = 0.25;
          innerGroup.scale.multiplyScalar(globalScale);
        } else {
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 2 / maxDim;
          innerGroup.scale.multiplyScalar(scale);
        }

        // Apply specific rotation for assembled model to sit properly on stand
        innerGroup.rotation.x = 0;
        innerGroup.rotation.y = 0;
        innerGroup.rotation.z = 0;

        // Create outer group for user/auto rotations
        const outerGroup = new THREE.Group();
        outerGroup.add(innerGroup);

        // Calculate the depth (Z dimension) after scaling
        const scaledSize = size.clone().multiplyScalar(
          this.config.useRealWorldScale ? 0.25 : (2 / Math.max(size.x, size.y, size.z))
        );
        const halfDepth = scaledSize.z / 2;

        // Position above the main model with Z offset at half the depth
        outerGroup.position.y = this.assembledViewConfig.yOffset;
        outerGroup.position.z = -halfDepth; // Negative moves away from camera

        // Store original Y and Z positions for shelf toggle
        this.assembledOriginalY = outerGroup.position.y;
        this.assembledOriginalZ = outerGroup.position.z;

        this.assembledModel = outerGroup;
        this.assembledModel.visible = this.assembledViewConfig.enabled;
        this.scene.add(this.assembledModel);

        resolve(outerGroup);
      },
      onProgress,
      reject
    );
  }

  /**
   * Internal method to load and process OBJ model
   */
  loadModel(loader, objPath, onProgress, resolve, reject) {
    loader.load(
      objPath,
      (object) => {
        if (this.model) {
          this.scene.remove(this.model);
        }

        // Apply default material
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (!child.material || !child.material.map) {
              child.material = new THREE.MeshPhongMaterial({
                color: this.config.modelColor,
                shininess: 30
              });
            }
            // Enable shadows on model only when shelf is visible
            child.castShadow = this.config.shelfVisible;
            child.receiveShadow = this.config.shelfVisible;
          }
        });

        // Calculate bounding box and center
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Center the object
        object.position.sub(center);

        // Create inner group for initial rotation and scaling
        const innerGroup = new THREE.Group();
        innerGroup.add(object);

        // Scale to fit view
        if (this.config.useRealWorldScale) {
          // Use real-world scale for consistent sizing across models
          const globalScale = 0.25;
          innerGroup.scale.multiplyScalar(globalScale);
        } else {
          // Auto-scale to fit view (default behavior for product cards)
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 2 / maxDim;
          innerGroup.scale.multiplyScalar(scale);
        }

        // Apply initial rotation
        if (this.config.initialRotation) {
          innerGroup.rotation.x = this.config.initialRotation.x || 0;
          innerGroup.rotation.y = this.config.initialRotation.y || 0;
          innerGroup.rotation.z = this.config.initialRotation.z || 0;
        }

        // Create outer group for user/auto rotations
        const outerGroup = new THREE.Group();
        outerGroup.add(innerGroup);

        this.model = outerGroup;
        this.scene.add(this.model);

        // If shelf is visible, position product on it
        if (this.config.shelfVisible) {
          this.positionProductOnShelf();
        }

        resolve(outerGroup);
      },
      onProgress,
      reject
    );
  }

  /**
   * Change the color of the 3D model
   */
  setModelColor(color) {
    if (!this.model) return;

    const hexColor = typeof color === 'string' ? parseInt(color.replace('#', '0x')) : color;
    this.config.modelColor = hexColor;

    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!child.material.map) {
          child.material.color.setHex(hexColor);
        }
      }
    });
  }

  /**
   * Change the color of the assembled model
   */
  setAssembledModelColor(color) {
    if (!this.assembledModel) return;

    const hexColor = typeof color === 'string' ? parseInt(color.replace('#', '0x')) : color;
    this.config.assembledModelColor = hexColor;

    this.assembledModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!child.material.map) {
          child.material.color.setHex(hexColor);
        }
      }
    });
  }

  /**
   * Animation loop
   */
  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    // Auto-rotate if enabled and not being dragged
    // Rotate camera around scene instead of rotating models
    if (this.config.autoRotate && !this.controls.isDragging) {
      const rotationAmount = this.config.autoRotateSpeed * 0.01;

      // Auto-rotate always orbits around Y axis (horizontal rotation)
      this.orbitalControls.theta += rotationAmount;
      this.updateCameraPosition();
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Handle window resize events
   */
  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Only update if dimensions are valid
    if (width > 0 && height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }

  /**
   * Update scene background color
   */
  setBackgroundColor(color) {
    this.scene.background = new THREE.Color(color);
  }

  /**
   * Reset rotation to initial state
   */
  resetRotation() {
    // Reset orbital camera to initial position
    this.orbitalControls.theta = 0;
    this.orbitalControls.phi = Math.PI / 2;
    this.updateCameraPosition();
  }

  /**
   * Clean up resources and event listeners
   */
  dispose() {
    // Stop animation loop
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Remove event listeners
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }

    // Remove canvas event listeners
    if (this.eventHandlers && this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener('mousedown', this.eventHandlers.onMouseDown);
      canvas.removeEventListener('mousemove', this.eventHandlers.onMouseMove);
      canvas.removeEventListener('mouseup', this.eventHandlers.onMouseUp);
      canvas.removeEventListener('mouseleave', this.eventHandlers.onMouseUp);
      canvas.removeEventListener('touchstart', this.eventHandlers.onTouchStart);
      canvas.removeEventListener('touchmove', this.eventHandlers.onTouchMove);
      canvas.removeEventListener('touchend', this.eventHandlers.onTouchEnd);
      canvas.removeEventListener('touchcancel', this.eventHandlers.onTouchEnd);
    }
    
    // Clean up Three.js objects
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }

    if (this.assembledModel) {
      this.scene.remove(this.assembledModel);
      this.assembledModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }

    if (this.shelf) {
      this.scene.remove(this.shelf);
      this.shelf.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    }
    
    this.renderer.dispose();
    
    if (this.container && this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
