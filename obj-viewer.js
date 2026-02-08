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
 * MULTI-OBJECT FEATURES (NEW):
 * - addObjectToScene(): Add new objects from product cards
 * - Object selection via click/tap (raycasting)
 * - Horizontal drag movement along shelf
 * - Visual selection indicators
 * - Object management (remove, clear, reorder)
 *
 * @example
 * const viewer = new OBJViewer('viewer-container', {
 *   backgroundColor: 0xf8f9fa,
 *   modelColor: 0x4a90e2,
 *   enableRotation: true
 * });
 * viewer.loadOBJ('path/to/model.obj');
 * 
 * // Multi-object usage:
 * viewer.addObjectToScene('path/to/model.obj', { id: 'product-1', color: 0xff0000 });
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
      // Multi-object configuration (NEW)
      shelfWidth: options.shelfWidth || 18,
      selectionColor: options.selectionColor || 0x00ff00,
      selectionEmissive: options.selectionEmissive || 0x003300,
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
      enabled: false,
      radius: this.config.cameraDistance,
      theta: 0, // Horizontal rotation angle
      phi: Math.PI / 2,
      target: new THREE.Vector3(0, 0, 0),
      minPhi: Math.PI / 12,
      maxPhi: Math.PI - Math.PI / 12,
      // ADD THESE TWO LINES for horizontal rotation limits:
      minTheta: -102 * (Math.PI / 180), // -102 degrees in radians
      maxTheta: 102 * (Math.PI / 180),  // +102 degrees in radians
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

    // ==========================================
    // MULTI-OBJECT PROPERTIES (NEW)
    // ==========================================
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.sceneObjects = []; // Array of { id, group, originalMaterials, bounds, baseShelfY, objPath }
    this.selectedObject = null;
    this.isDraggingObject = false;
    this.dragStartX = 0;
    this.objectStartX = 0;
    this.selectionIndicator = null;

    // Snap-to-object properties
    this.snapThreshold = 0.2; // Distance threshold for snapping (units) - reduced from 0.5 to prevent "flying" between nearby objects
    this.snapYOffset = 0.025; // Height offset when snapped on modular stand

    // Multi-slot weighted-base properties
    this.weightedBaseSlots = new Map(); // Maps weighted-base ID -> array of slot objects
    this.maxSlotsPerBase = 10; // Maximum MagCaseAssembled objects per weighted-base
    this.assembledDepth = null; // Depth of MagCaseAssembled (calculated from first one added)
    this.assembledToSlot = new Map(); // Maps assembled object ID -> { baseId, slotIndex }
    this.dragMode = null; // 'shelf' or 'weighted-base' - tracks current drag behavior

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
    this.renderer.shadowMap.enabled = this.config.shelfVisible; // Enable shadows if shelf is initially visible
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows for better quality
    this.container.appendChild(this.renderer.domElement);

    // Add lights
    this.addLights();

    // Create shelf
    this.createShelf();

    // Create selection indicator (NEW)
    this.createSelectionIndicator();

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7 * this.config.lightIntensity);
    this.scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.5 * this.config.lightIntensity);
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
   * Create visual selection indicator (ring around selected object) (NEW)
   */
  createSelectionIndicator() {
    const geometry = new THREE.RingGeometry(0.8, 1, 32);
    const material = new THREE.MeshBasicMaterial({ 
      color: this.config.selectionColor, 
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    this.selectionIndicator = new THREE.Mesh(geometry, material);
    this.selectionIndicator.rotation.x = -Math.PI / 2; // Lay flat
    this.selectionIndicator.visible = false;
    this.scene.add(this.selectionIndicator);
  }

  /**
   * Setup interaction controls with improved touch support
   * MODIFIED: Added object selection and dragging support
   */
  setupControls() {
    const canvas = this.renderer.domElement;

    // Track if we're doing a click vs drag (NEW)
    let mouseDownTime = 0;
    let mouseDownPos = { x: 0, y: 0 };
    const CLICK_THRESHOLD = 200; // ms
    const MOVE_THRESHOLD = 5; // pixels

    // Double-click detection
    let lastClickTime = 0;
    let lastClickedObject = null;
    const DOUBLE_CLICK_THRESHOLD = 300; // ms

    // Mouse events
    const onMouseDown = (e) => {
      mouseDownTime = Date.now();
      mouseDownPos = { x: e.clientX, y: e.clientY };

      // Check if clicking on a scene object (NEW)
      this.updateMousePosition(e);
      const clickedObject = this.getObjectUnderMouse();

      if (clickedObject && this.config.shelfVisible) {
        // Start object dragging mode
        this.isDraggingObject = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.objectStartX = clickedObject.group.position.x;
        this.objectStartZ = clickedObject.group.position.z;

        // Determine drag mode based on whether object is in a weighted-base slot
        const slotInfo = this.assembledToSlot.get(clickedObject.id);
        this.dragMode = slotInfo ? 'weighted-base' : 'shelf';

        this.selectObject(clickedObject);
        canvas.style.cursor = 'grabbing';
        return;
      }

      // Initialize camera rotation - update previousMousePosition to CURRENT position
      // This prevents camera snap/jump when starting a new drag
      this.controls.previousMousePosition = { x: e.clientX, y: e.clientY };
      this.controls.isDragging = true;
      canvas.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      // Handle object dragging (NEW)
      if (this.isDraggingObject && this.selectedObject) {
        const deltaX = e.clientX - this.dragStartX;
        const deltaY = e.clientY - this.dragStartY;
        const sensitivity = 0.01;

        if (this.dragMode === 'weighted-base') {
          // Z-axis dragging within weighted-base (map mouse Y to world Z)
          const zSensitivity = 0.008;
          let newZ = this.objectStartZ + deltaY * zSensitivity;

          // Snap to nearest slot
          newZ = this.checkWeightedBaseSlotSnapping(this.selectedObject, newZ);
          this.selectedObject.group.position.z = newZ;

          // Update shader uniforms for split-color materials
          this.updateSplitColorShaderUniforms(this.selectedObject);

          // Check if dragged far enough in X direction to exit weighted-base
          const xDistance = Math.abs(deltaX * sensitivity);
          if (xDistance > this.snapThreshold) {
            // Exit weighted-base mode, return to shelf
            this.unsnapObject(this.selectedObject);
            this.dragMode = 'shelf';
            this.objectStartX = this.selectedObject.group.position.x;
          }

        } else {
          // X-axis dragging on shelf
          let newX = this.objectStartX + deltaX * sensitivity;

          // Clamp to shelf bounds
          const halfShelf = this.config.shelfWidth / 2;
          const objectHalfWidth = this.selectedObject.bounds.x / 2;
          newX = Math.max(-halfShelf + objectHalfWidth, Math.min(halfShelf - objectHalfWidth, newX));

          this.selectedObject.group.position.x = newX;

          // If dragging a weighted-base or modular_stand, move all MagCaseAssembled objects with it
          const normalizedPath = decodeURIComponent(this.selectedObject.objPath).toLowerCase().replace(/[_\s]/g, '-');
          const isWeightedBase = normalizedPath.includes('weighted-base');
          const isModularStand = normalizedPath.includes('modular-stand');
          if (isWeightedBase || isModularStand) {
            this.moveChildrenWithBase(this.selectedObject);
          }

          // Check for snap targets (NEW - Snap Feature)
          const snapTarget = this.checkSnapTargets(this.selectedObject);
          if (snapTarget) {
            this.snapToObject(this.selectedObject, snapTarget);
            // Reset drag references to prevent fighting the snap position
            this.objectStartX = this.selectedObject.group.position.x;
            this.dragStartX = e.clientX;
            // If snapped to weighted-base, switch to that drag mode
            if (snapTarget.type === 'weighted-base') {
              this.dragMode = 'weighted-base';
              this.objectStartZ = this.selectedObject.group.position.z;
              this.dragStartY = e.clientY;
            }
          } else {
            // Check if was previously in a slot and moved away
            const slotInfo = this.assembledToSlot.get(this.selectedObject.id);
            if (slotInfo) {
              this.unsnapObject(this.selectedObject);
            }
          }
        }

        this.updateSelectionIndicator();
        return;
      }

      if (this.controls.isDragging) {
        // Check if mouse has moved beyond threshold - prevents camera rotation on tiny clicks
        const moveDist = Math.sqrt(
          Math.pow(e.clientX - mouseDownPos.x, 2) +
          Math.pow(e.clientY - mouseDownPos.y, 2)
        );

        // Only rotate camera if moved beyond threshold
        if (moveDist >= MOVE_THRESHOLD) {
          const deltaX = e.clientX - this.controls.previousMousePosition.x;
          const deltaY = e.clientY - this.controls.previousMousePosition.y;

          // Always use orbital camera to prevent model overlap when rotating
          this.updateOrbitalCamera(deltaX, deltaY);

          this.controls.previousMousePosition = { x: e.clientX, y: e.clientY };
        }
      } else {
        // Hover effect (NEW)
        this.updateMousePosition(e);
        const hoverObject = this.getObjectUnderMouse();
        canvas.style.cursor = hoverObject && this.config.shelfVisible ? 'pointer' : 'grab';
      }
    };

    const onMouseUp = (e) => {
      const timeDiff = Date.now() - mouseDownTime;
      const moveDist = Math.sqrt(
        Math.pow(e.clientX - mouseDownPos.x, 2) +
        Math.pow(e.clientY - mouseDownPos.y, 2)
      );

      // If it was a quick click without much movement, treat as selection (NEW)
      if (timeDiff < CLICK_THRESHOLD && moveDist < MOVE_THRESHOLD) {
        this.updateMousePosition(e);
        const clickedObject = this.getObjectUnderMouse();

        // Check for double-click
        const currentTime = Date.now();
        const timeSinceLastClick = currentTime - lastClickTime;

        if (clickedObject &&
            lastClickedObject &&
            lastClickedObject === clickedObject &&
            timeSinceLastClick > 0 &&
            timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
          // Double-click detected!
          console.log('Double-click detected on:', clickedObject.name, clickedObject);

          // Determine snap state
          let snapState = { isSnapped: false, snapType: null, occupiedSlots: 0 };

          const slotInfo = this.assembledToSlot.get(clickedObject.id);
          if (slotInfo) {
            snapState.isSnapped = true;
            snapState.snapType = slotInfo.slotIndex === null ? 'modular-stand' : 'weighted-base';
            snapState.baseId = slotInfo.baseId;
          }

          // Check if weighted-base and count occupied slots
          if (decodeURIComponent(clickedObject.objPath).toLowerCase().replace(/[_\s]/g, '-').includes('weighted-base')) {
            const slots = this.weightedBaseSlots.get(clickedObject.id);
            if (slots) {
              snapState.occupiedSlots = slots.filter(s => s.assembledObj !== null).length;
            }
          }

          const event = new CustomEvent('objectDoubleClicked', {
            detail: {
              id: clickedObject.id,
              object: clickedObject,
              name: clickedObject.name,
              objPath: clickedObject.objPath,
              snapState: snapState
            }
          });
          this.container.dispatchEvent(event);
          console.log('objectDoubleClicked event dispatched with snapState:', snapState);

          // Reset double-click tracking
          lastClickTime = 0;
          lastClickedObject = null;
        } else {
          // Single click - select object
          this.handleObjectSelection();

          // Update double-click tracking
          lastClickTime = currentTime;
          lastClickedObject = clickedObject;
        }
      }

      this.controls.isDragging = false;
      this.isDraggingObject = false;
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);

    // Touch support - prevents page scrolling while rotating
    let touchStartPos = { x: 0, y: 0 };
    let touchStartTime = 0;
    let twoFingerPanning = false;
    let twoFingerStartMidpoint = { x: 0, y: 0 };
    let twoFingerStartPositions = []; // Track individual finger positions
    let cameraTargetStartX = 0;

    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        e.preventDefault(); // Prevent page scroll
        touchStartTime = Date.now();
        touchStartPos = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };

        // Check if touching an object (NEW)
        this.updateTouchPosition(e.touches[0]);
        const touchedObject = this.getObjectUnderMouse();

        if (touchedObject && this.config.shelfVisible) {
          this.isDraggingObject = true;
          this.dragStartX = e.touches[0].clientX;
          this.dragStartY = e.touches[0].clientY;
          this.objectStartX = touchedObject.group.position.x;
          this.objectStartZ = touchedObject.group.position.z;

          // Determine drag mode based on whether object is in a weighted-base slot
          const slotInfo = this.assembledToSlot.get(touchedObject.id);
          this.dragMode = slotInfo ? 'weighted-base' : 'shelf';

          this.selectObject(touchedObject);
          return;
        }

        // Initialize camera rotation - update previousMousePosition to CURRENT position
        // This prevents camera snap/jump when starting a new drag
        this.controls.previousMousePosition = touchStartPos;
        this.controls.isDragging = true;
      } else if (e.touches.length === 2) {
        // Two fingers detected - but don't activate panning yet
        e.preventDefault();

        // Store individual finger positions
        twoFingerStartPositions = [
          { x: e.touches[0].clientX, y: e.touches[0].clientY },
          { x: e.touches[1].clientX, y: e.touches[1].clientY }
        ];

        // Calculate midpoint between two fingers
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        twoFingerStartMidpoint = { x: midX, y: midY };

        // Store starting camera target X position
        cameraTargetStartX = this.orbitalControls.target.x;

        // Don't immediately stop single-finger actions - wait for movement
        // twoFingerPanning will be set to true in touchmove if appropriate
      }
    };

    const onTouchMove = (e) => {
      // Check if we should activate two-finger panning
      if (!twoFingerPanning && e.touches.length === 2 && twoFingerStartPositions.length === 2) {
        // Calculate movement of each finger
        const finger1DeltaX = e.touches[0].clientX - twoFingerStartPositions[0].x;
        const finger1DeltaY = e.touches[0].clientY - twoFingerStartPositions[0].y;
        const finger2DeltaX = e.touches[1].clientX - twoFingerStartPositions[1].x;
        const finger2DeltaY = e.touches[1].clientY - twoFingerStartPositions[1].y;

        // Check if both fingers moved horizontally (more X than Y movement)
        const finger1IsHorizontal = Math.abs(finger1DeltaX) > Math.abs(finger1DeltaY);
        const finger2IsHorizontal = Math.abs(finger2DeltaX) > Math.abs(finger2DeltaY);

        // Check if both fingers moved in the same horizontal direction
        const sameDirection = (finger1DeltaX * finger2DeltaX) > 0;

        // Movement threshold (at least 10 pixels)
        const finger1Moved = Math.abs(finger1DeltaX) > 10 || Math.abs(finger1DeltaY) > 10;
        const finger2Moved = Math.abs(finger2DeltaX) > 10 || Math.abs(finger2DeltaY) > 10;

        // Activate panning if both fingers moved horizontally in same direction
        if (finger1IsHorizontal && finger2IsHorizontal && sameDirection && finger1Moved && finger2Moved) {
          twoFingerPanning = true;
          // Stop single-finger actions
          this.controls.isDragging = false;
          this.isDraggingObject = false;
        }
      }

      // Handle two-finger panning
      if (twoFingerPanning && e.touches.length === 2) {
        e.preventDefault();

        // Calculate current midpoint
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;

        // Calculate horizontal movement
        const deltaX = midX - twoFingerStartMidpoint.x;

        // Pan sensitivity - negative to invert direction (pan left = camera moves right)
        const panSensitivity = -0.01;
        const newTargetX = cameraTargetStartX + deltaX * panSensitivity;

        // Clamp camera target to half shelf width (±5 units for 10-unit effective width)
        this.orbitalControls.target.x = Math.max(-5, Math.min(5, newTargetX));

        // Update camera position based on new target
        this.updateCameraPosition();
        return;
      }

      if (this.controls.isDragging && e.touches.length === 1) {
        e.preventDefault(); // Prevent page scroll
        const touch = e.touches[0];

        // Handle object dragging (NEW)
        if (this.isDraggingObject && this.selectedObject) {
          const deltaX = touch.clientX - this.dragStartX;
          const deltaY = touch.clientY - this.dragStartY;
          const sensitivity = 0.01;

          if (this.dragMode === 'weighted-base') {
            // Z-axis dragging within weighted-base (map touch Y to world Z)
            const zSensitivity = 0.008;
            let newZ = this.objectStartZ + deltaY * zSensitivity;

            // Snap to nearest slot
            newZ = this.checkWeightedBaseSlotSnapping(this.selectedObject, newZ);
            this.selectedObject.group.position.z = newZ;

            // Update shader uniforms for split-color materials
            this.updateSplitColorShaderUniforms(this.selectedObject);

            // Check if dragged far enough in X direction to exit weighted-base
            const xDistance = Math.abs(deltaX * sensitivity);
            if (xDistance > this.snapThreshold) {
              // Exit weighted-base mode, return to shelf
              this.unsnapObject(this.selectedObject);
              this.dragMode = 'shelf';
              this.objectStartX = this.selectedObject.group.position.x;
            }

          } else {
            // X-axis dragging on shelf
            let newX = this.objectStartX + deltaX * sensitivity;

            // Clamp to shelf bounds
            const halfShelf = this.config.shelfWidth / 2;
            const objectHalfWidth = this.selectedObject.bounds.x / 2;
            newX = Math.max(-halfShelf + objectHalfWidth, Math.min(halfShelf - objectHalfWidth, newX));

            this.selectedObject.group.position.x = newX;

            // If dragging a weighted-base or modular_stand, move all MagCaseAssembled objects with it
            const normalizedPath = decodeURIComponent(this.selectedObject.objPath).toLowerCase().replace(/[_\s]/g, '-');
            const isWeightedBase = normalizedPath.includes('weighted-base');
            const isModularStand = normalizedPath.includes('modular-stand');
            if (isWeightedBase || isModularStand) {
              this.moveChildrenWithBase(this.selectedObject);
            }

            // Check for snap targets (NEW - Snap Feature)
            const snapTarget = this.checkSnapTargets(this.selectedObject);
            if (snapTarget) {
              this.snapToObject(this.selectedObject, snapTarget);
              // Reset drag references to prevent fighting the snap position
              this.objectStartX = this.selectedObject.group.position.x;
              this.dragStartX = touch.clientX;
              // If snapped to weighted-base, switch to that drag mode
              if (snapTarget.type === 'weighted-base') {
                this.dragMode = 'weighted-base';
                this.objectStartZ = this.selectedObject.group.position.z;
                this.dragStartY = touch.clientY;
              }
            } else {
              // Check if was previously in a slot and moved away
              const slotInfo = this.assembledToSlot.get(this.selectedObject.id);
              if (slotInfo) {
                this.unsnapObject(this.selectedObject);
              }
            }
          }

          this.updateSelectionIndicator();
          return;
        }

        // Check if touch has moved beyond threshold - prevents camera rotation on tiny taps
        const moveDist = Math.sqrt(
          Math.pow(touch.clientX - touchStartPos.x, 2) +
          Math.pow(touch.clientY - touchStartPos.y, 2)
        );

        // Only rotate camera if moved beyond threshold
        if (moveDist >= MOVE_THRESHOLD) {
          const deltaX = touch.clientX - this.controls.previousMousePosition.x;
          const deltaY = touch.clientY - this.controls.previousMousePosition.y;

          // Always use orbital camera to prevent model overlap when rotating
          this.updateOrbitalCamera(deltaX, deltaY);

          this.controls.previousMousePosition = {
            x: touch.clientX,
            y: touch.clientY
          };
        }
      }
    };

    const onTouchEnd = (e) => {
      // Reset two-finger panning when fingers are lifted
      if (e.touches.length < 2) {
        twoFingerPanning = false;
      }

      const timeDiff = Date.now() - touchStartTime;

      // If it was a quick tap, treat as selection or double-tap (NEW)
      if (timeDiff < CLICK_THRESHOLD) {
        const tappedObject = this.getObjectUnderMouse();

        // Check for double-tap
        const currentTime = Date.now();
        const timeSinceLastClick = currentTime - lastClickTime;

        if (tappedObject &&
            lastClickedObject &&
            lastClickedObject === tappedObject &&
            timeSinceLastClick > 0 &&
            timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
          // Double-tap detected!
          console.log('Double-tap detected on:', tappedObject.name, tappedObject);

          // Determine snap state
          let snapState = { isSnapped: false, snapType: null, occupiedSlots: 0 };

          const slotInfo = this.assembledToSlot.get(tappedObject.id);
          if (slotInfo) {
            snapState.isSnapped = true;
            snapState.snapType = slotInfo.slotIndex === null ? 'modular-stand' : 'weighted-base';
            snapState.baseId = slotInfo.baseId;
          }

          // Check if weighted-base and count occupied slots
          if (decodeURIComponent(tappedObject.objPath).toLowerCase().replace(/[_\s]/g, '-').includes('weighted-base')) {
            const slots = this.weightedBaseSlots.get(tappedObject.id);
            if (slots) {
              snapState.occupiedSlots = slots.filter(s => s.assembledObj !== null).length;
            }
          }

          const event = new CustomEvent('objectDoubleClicked', {
            detail: {
              id: tappedObject.id,
              object: tappedObject,
              name: tappedObject.name,
              objPath: tappedObject.objPath,
              snapState: snapState
            }
          });
          this.container.dispatchEvent(event);
          console.log('objectDoubleClicked event dispatched (touch) with snapState:', snapState);

          // Reset double-tap tracking
          lastClickTime = 0;
          lastClickedObject = null;
        } else {
          // Single tap - select object
          this.handleObjectSelection();

          // Update double-tap tracking
          lastClickTime = currentTime;
          lastClickedObject = tappedObject;
        }
      }

      this.controls.isDragging = false;
      this.isDraggingObject = false;
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    // Keyboard support for arrow keys (desktop camera panning)
    const onKeyDown = (e) => {
      // Only handle arrow keys when shelf is visible
      if (!this.config.shelfVisible) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); // Prevent page scroll

        // Pan camera left or right
        const panAmount = 0.15; // Units to move per key press
        const direction = e.key === 'ArrowLeft' ? -1 : 1;

        let newTargetX = this.orbitalControls.target.x + (panAmount * direction);

        // Clamp camera target to half shelf width (±5 units)
        newTargetX = Math.max(-5, Math.min(5, newTargetX));

        this.orbitalControls.target.x = newTargetX;
        this.updateCameraPosition();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // Keyboard navigation support - arrow keys for rotation when focused
    let viewerKeyHandler = null;

    const onFocus = (e) => {
      // Create and attach arrow key handler when viewer gains focus
      viewerKeyHandler = (e) => {
        // Handle arrow keys for 3D rotation
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault(); // Prevent page scroll

          const rotationAmount = 0.05; // Rotation increment in radians

          if (e.key === 'ArrowLeft') {
            // Rotate camera left (decrease theta)
            this.orbitalControls.theta -= rotationAmount;
          } else if (e.key === 'ArrowRight') {
            // Rotate camera right (increase theta)
            this.orbitalControls.theta += rotationAmount;
          } else if (e.key === 'ArrowUp') {
            // Rotate camera up (decrease phi)
            this.orbitalControls.phi -= rotationAmount;
          } else if (e.key === 'ArrowDown') {
            // Rotate camera down (increase phi)
            this.orbitalControls.phi += rotationAmount;
          }

          // Clamp phi (vertical rotation)
          this.orbitalControls.phi = Math.max(
            this.orbitalControls.minPhi,
            Math.min(this.orbitalControls.maxPhi, this.orbitalControls.phi)
          );

          // Clamp theta (horizontal rotation)
          this.orbitalControls.theta = Math.max(
            this.orbitalControls.minTheta,
            Math.min(this.orbitalControls.maxTheta, this.orbitalControls.theta)
          );

          this.updateCameraPosition();
        }
      };

      document.addEventListener('keydown', viewerKeyHandler);
    };

    const onBlur = (e) => {
      // Remove arrow key handler when viewer loses focus
      if (viewerKeyHandler) {
        document.removeEventListener('keydown', viewerKeyHandler);
        viewerKeyHandler = null;
      }
    };

    this.container.addEventListener('focus', onFocus);
    this.container.addEventListener('blur', onBlur);

    // Store references for cleanup
    this.eventHandlers = {
      onMouseDown, onMouseMove, onMouseUp,
      onTouchStart, onTouchMove, onTouchEnd,
      onKeyDown, onFocus, onBlur
    };

    canvas.style.cursor = 'grab';
  }

  // ==========================================
  // MULTI-OBJECT HELPER METHODS (NEW)
  // ==========================================

  /**
   * Update mouse position for raycasting (NEW)
   */
  updateMousePosition(event) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Update touch position for raycasting (NEW)
   */
  updateTouchPosition(touch) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Get the scene object under the current mouse position (NEW)
   */
  getObjectUnderMouse() {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const meshes = [];
    this.sceneObjects.forEach(obj => {
      obj.group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          meshes.push({ mesh: child, sceneObject: obj });
        }
      });
    });

    const intersects = this.raycaster.intersectObjects(meshes.map(m => m.mesh));

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const matchedObj = meshes.find(m => m.mesh === hitMesh);
      return matchedObj ? matchedObj.sceneObject : null;
    }

    return null;
  }

  /**
   * Handle object selection on click/tap (NEW)
   */
  handleObjectSelection() {
    const clickedObject = this.getObjectUnderMouse();

    if (clickedObject) {
      this.selectObject(clickedObject);
    } else {
      this.deselectObject();
    }
  }

  /**
   * Select an object and show visual feedback (NEW)
   */
  selectObject(sceneObject) {
    if (this.selectedObject && this.selectedObject !== sceneObject) {
      this.restoreObjectMaterials(this.selectedObject);
    }

    this.selectedObject = sceneObject;
    this.highlightObject(sceneObject);
    this.updateSelectionIndicator();

    const event = new CustomEvent('objectSelected', { 
      detail: { id: sceneObject.id, object: sceneObject } 
    });
    this.container.dispatchEvent(event);
  }

  /**
   * Deselect current object (NEW)
   */
  deselectObject() {
    if (this.selectedObject) {
      this.restoreObjectMaterials(this.selectedObject);
      this.selectedObject = null;
      this.selectionIndicator.visible = false;

      const event = new CustomEvent('objectDeselected');
      this.container.dispatchEvent(event);
    }
  }

  /**
   * Apply highlight effect to selected object (NEW)
   */
  highlightObject(sceneObject) {
    sceneObject.group.traverse(child => {
      if (child instanceof THREE.Mesh && child.material.emissive) {
        child.material.emissive.setHex(this.config.selectionEmissive);
      }
    });
  }

  /**
   * Restore original materials after deselection (NEW)
   */
  restoreObjectMaterials(sceneObject) {
    sceneObject.group.traverse(child => {
      if (child instanceof THREE.Mesh && child.material.emissive) {
        child.material.emissive.setHex(0x000000);
      }
    });
  }

  /**
   * Update selection indicator position (NEW)
   */
  updateSelectionIndicator() {
    if (!this.selectedObject) {
      this.selectionIndicator.visible = false;
      return;
    }

    const box = new THREE.Box3().setFromObject(this.selectedObject.group);
    const size = box.getSize(new THREE.Vector3());

    this.selectionIndicator.position.set(
      this.selectedObject.group.position.x,
      -1.41,
      0
    );

    const scale = Math.max(size.x, size.z) * 0.7;
    this.selectionIndicator.scale.set(scale, scale, scale);
    this.selectionIndicator.visible = true;
  }

  /**
   * Update shader uniform for split-color materials to track object center position (NEW)
   * @param {Object} sceneObject - The scene object whose shader uniforms should be updated
   */
  updateSplitColorShaderUniforms(sceneObject) {
    const centerZ = sceneObject.group.position.z;
    sceneObject.group.traverse(child => {
      if (child instanceof THREE.Mesh &&
          child.material instanceof THREE.ShaderMaterial &&
          child.material.uniforms.objectCenterZ !== undefined) {
        child.material.uniforms.objectCenterZ.value = centerZ;
      }
    });
  }

  /**
   * Check if dragged object is near a snap target (NEW - Snap Feature)
   * @param {Object} draggedObject - The scene object being dragged
   * @returns {Object|null} - { target: sceneObject, type: 'modular-stand'|'weighted-base' } or null
   */
  checkSnapTargets(draggedObject) {
    // Only MagCaseAssembled can snap to other objects
    if (!decodeURIComponent(draggedObject.objPath).toLowerCase().replace(/[_\s]/g, '').includes('magcaseassembled')) {
      return null;
    }

    const draggedX = draggedObject.group.position.x;
    let closestTarget = null;
    let closestDistance = this.snapThreshold;
    let targetType = null;

    // Find all valid snap targets (MagCase Stand and Weighted Base)
    this.sceneObjects.forEach(obj => {
      if (obj === draggedObject) return; // Skip self

      const normalizedPath = decodeURIComponent(obj.objPath).toLowerCase().replace(/[_\s]/g, '-');
      const isModularStand = normalizedPath.includes('modular-stand');
      const isWeightedBase = normalizedPath.includes('weighted-base');

      if (isModularStand || isWeightedBase) {
        // For modular_stand, check if already occupied (only 1 magcase allowed)
        if (isModularStand) {
          // Check if any magcase is already snapped to this stand
          const isOccupied = Array.from(this.assembledToSlot.entries()).some(
            ([assembledId, slotInfo]) =>
              slotInfo.baseId === obj.id &&
              slotInfo.slotIndex === null &&
              assembledId !== draggedObject.id  // Allow re-snapping the same object
          );
          if (isOccupied) return; // Stand already has a magcase
        }

        // For weighted-base, check if it has available slots
        if (isWeightedBase) {
          const slots = this.weightedBaseSlots.get(obj.id);
          if (!slots) return; // Slots not initialized yet

          const hasAvailableSlot = slots.some(slot => slot.assembledObj === null);
          if (!hasAvailableSlot) return; // All slots occupied
        }

        const distance = Math.abs(draggedX - obj.group.position.x);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestTarget = obj;
          targetType = isWeightedBase ? 'weighted-base' : 'modular-stand';
        }
      }
    });

    return closestTarget ? { target: closestTarget, type: targetType } : null;
  }

  /**
   * Snap assembled object to target (NEW - Snap Feature)
   * @param {Object} assembledObj - The MagCaseAssembled object to snap
   * @param {Object} snapInfo - { target: sceneObject, type: 'modular-stand'|'weighted-base' }
   */
  snapToObject(assembledObj, snapInfo) {
    const { target: targetObj, type: targetType } = snapInfo;

    // Center X position over target
    assembledObj.group.position.x = targetObj.group.position.x;

    if (targetType === 'modular-stand') {
      // Modular stand: raise slightly above shelf
      assembledObj.group.position.y = assembledObj.baseShelfY + this.snapYOffset;
      assembledObj.group.position.z = 0;

      // Update shader uniforms for split-color materials
      this.updateSplitColorShaderUniforms(assembledObj);

      // Track relationship using same Map as weighted-base (no slotIndex needed)
      this.assembledToSlot.set(assembledObj.id, {
        baseId: targetObj.id,
        slotIndex: null  // No slots for modular_stand
      });

    } else if (targetType === 'weighted-base') {
      // Weighted-base: find first available slot
      const slots = this.weightedBaseSlots.get(targetObj.id);
      if (!slots) {
        console.error('No slots found for weighted-base:', targetObj.id);
        return;
      }

      // Find first available slot
      const availableSlot = slots.find(slot => slot.assembledObj === null);
      if (!availableSlot) {
        console.warn('No available slots in weighted-base:', targetObj.id);
        return;
      }

      // Position in the slot
      assembledObj.group.position.y = assembledObj.baseShelfY; // Same height as shelf (inside base)
      assembledObj.group.position.z = availableSlot.snapPointZ;

      // Update shader uniforms for split-color materials
      this.updateSplitColorShaderUniforms(assembledObj);

      // Mark slot as occupied
      availableSlot.assembledObj = assembledObj;

      // Track which base and slot this object is in
      this.assembledToSlot.set(assembledObj.id, {
        baseId: targetObj.id,
        slotIndex: availableSlot.slotIndex
      });

      console.log(`Snapped ${assembledObj.id} to weighted-base ${targetObj.id}, slot ${availableSlot.slotIndex}`);
    }
  }

  /**
   * Unsnap assembled object and return to shelf (NEW - Snap Feature)
   * @param {Object} assembledObj - The MagCaseAssembled object to unsnap
   */
  unsnapObject(assembledObj) {
    // Check if object is snapped to modular_stand or weighted-base
    const slotInfo = this.assembledToSlot.get(assembledObj.id);
    if (slotInfo) {
      // Free the slot (only for weighted-base with slotIndex)
      if (slotInfo.slotIndex !== null) {
        const slots = this.weightedBaseSlots.get(slotInfo.baseId);
        if (slots && slots[slotInfo.slotIndex]) {
          slots[slotInfo.slotIndex].assembledObj = null;
        }
      }
      this.assembledToSlot.delete(assembledObj.id);
    }

    // Restore original shelf Y position
    assembledObj.group.position.y = assembledObj.baseShelfY;

    // Reset Z position to center
    assembledObj.group.position.z = 0;

    // Update shader uniforms for split-color materials
    this.updateSplitColorShaderUniforms(assembledObj);
  }

  /**
   * Initialize slot positions for a weighted-base organizer (NEW - Multi-Slot Feature)
   * @param {Object} weightedBaseObj - The weighted-base scene object
   */
  initializeWeightedBaseSlots(weightedBaseObj) {
    if (!this.assembledDepth) {
      console.warn('Cannot initialize weighted-base slots: MagCaseAssembled depth not yet calculated');
      return;
    }

    const slots = [];
    const baseZ = weightedBaseObj.group.position.z;
    const frontEdgeZ = baseZ + (weightedBaseObj.bounds.z / 2);
    const slotSpacing = this.assembledDepth;
    const wallOffset = -0.075; // Offset toward the wall (negative Z)

    // Create 10 slot positions from front to back
    for (let i = 0; i < this.maxSlotsPerBase; i++) {
      const snapPointZ = frontEdgeZ - (i * slotSpacing) - (slotSpacing / 2) + wallOffset;
      slots.push({
        assembledObj: null,
        snapPointZ: snapPointZ,
        slotIndex: i
      });
    }

    this.weightedBaseSlots.set(weightedBaseObj.id, slots);
    console.log(`Initialized ${this.maxSlotsPerBase} slots for weighted-base: ${weightedBaseObj.id}`);
  }

  /**
   * Check and snap to nearest slot when dragging within a weighted-base (NEW - Multi-Slot Feature)
   * @param {Object} assembledObj - The MagCaseAssembled object being dragged
   * @param {number} currentZ - Current Z position of the object
   * @returns {number} - The snapped Z position
   */
  checkWeightedBaseSlotSnapping(assembledObj, currentZ) {
    const slotInfo = this.assembledToSlot.get(assembledObj.id);
    if (!slotInfo) return currentZ; // Not in a weighted-base

    const slots = this.weightedBaseSlots.get(slotInfo.baseId);
    if (!slots) return currentZ;

    // Find the closest available slot (including current slot)
    let closestSlot = null;
    let closestDistance = Infinity;

    slots.forEach((slot) => {
      // Allow current slot or empty slots
      if (slot.assembledObj === null || slot.assembledObj === assembledObj) {
        const distance = Math.abs(currentZ - slot.snapPointZ);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestSlot = slot;
        }
      }
    });

    if (closestSlot) {
      // Free the old slot
      const oldSlot = slots[slotInfo.slotIndex];
      if (oldSlot && oldSlot.assembledObj === assembledObj) {
        oldSlot.assembledObj = null;
      }

      // Occupy the new slot
      closestSlot.assembledObj = assembledObj;

      // Update tracking
      this.assembledToSlot.set(assembledObj.id, {
        baseId: slotInfo.baseId,
        slotIndex: closestSlot.slotIndex
      });

      return closestSlot.snapPointZ;
    }

    return currentZ;
  }

  /**
   * Move all MagCaseAssembled objects that are in a weighted-base's slots (NEW - Parent-Child Movement)
   * @param {Object} weightedBaseObj - The weighted-base scene object being dragged
   */
  moveChildrenWithBase(weightedBaseObj) {
    // Find all MagCaseAssembled objects that are in this weighted-base's slots
    this.assembledToSlot.forEach((slotInfo, assembledId) => {
      if (slotInfo.baseId === weightedBaseObj.id) {
        // Find the assembled object
        const assembledObj = this.sceneObjects.find(obj => obj.id === assembledId);
        if (assembledObj) {
          // Set absolute position to match weighted-base (children are centered on base)
          // This prevents accumulation of incremental movements
          assembledObj.group.position.x = weightedBaseObj.group.position.x;
        }
      }
    });
  }

  /**
   * Update orbital camera position based on mouse/touch delta
   */
  updateOrbitalCamera(deltaX, deltaY) {
    this.orbitalControls.theta -= deltaX * this.orbitalControls.rotationSensitivity;
    this.orbitalControls.phi += deltaY * this.orbitalControls.rotationSensitivity;

    // Clamp phi (vertical rotation) - already exists
    this.orbitalControls.phi = Math.max(
      this.orbitalControls.minPhi,
      Math.min(this.orbitalControls.maxPhi, this.orbitalControls.phi)
    );

    // ADD THIS: Clamp theta (horizontal rotation) to ±100 degrees
    this.orbitalControls.theta = Math.max(
      this.orbitalControls.minTheta,
      Math.min(this.orbitalControls.maxTheta, this.orbitalControls.theta)
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

    // Toggle shadows on scene objects (NEW)
    this.sceneObjects.forEach(obj => {
      obj.group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = visible;
          child.receiveShadow = visible;
        }
      });
    });

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
        // Hide selection when shelf is hidden (NEW)
        this.deselectObject();
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

  // ==========================================
  // MULTI-OBJECT SCENE MANAGEMENT (NEW)
  // ==========================================

  /**
   * Create a split color shader material for two-tone coloring along Z axis
   */
  createSplitColorMaterial(colorA, colorB) {
    return new THREE.ShaderMaterial({
      uniforms: {
        colorA: { value: new THREE.Color(colorA) },
        colorB: { value: new THREE.Color(colorB) },
        objectCenterZ: { value: 0.0 }
      },
      vertexShader: [
        'varying vec3 vWorldPosition;',
        'varying vec3 vNormal;',
        'void main() {',
        '  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
        '  vNormal = normalize(normalMatrix * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 colorA;',
        'uniform vec3 colorB;',
        'uniform float objectCenterZ;',
        'varying vec3 vWorldPosition;',
        'varying vec3 vNormal;',
        'void main() {',
        '  float relativeZ = vWorldPosition.z - objectCenterZ;',
        '  float t = relativeZ < 0.0 ? 1.0 : 0.0;',
        '  vec3 baseColor = mix(colorA, colorB, t);',
        '  vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));',
        '  float diff = max(dot(vNormal, lightDir), 0.0) * 0.7;',
        '  float lighting = 0.4 + diff;',
        '  gl_FragColor = vec4(baseColor * lighting, 1.0);',
        '}'
      ].join('\n'),
      side: THREE.DoubleSide
    });
  }

  /**
   * Add a new object to the scene from a product card/button (NEW)
   * @param {string} objPath - Path to the .obj file
   * @param {Object} options - Configuration options
   * @param {string} options.id - Unique identifier for this object
   * @param {number|string} options.color - Model color (hex or CSS string)
   * @param {number|string} options.colorB - Second color for split coloring (hex or CSS string)
   * @param {number} options.scale - Scale multiplier (default: 1)
   * @param {number} options.positionX - Initial X position on shelf
   * @param {Object} options.rotation - Initial rotation { x, y, z }
   * @returns {Promise} - Resolves with the added object data
   */
  addObjectToScene(objPath, options = {}) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.OBJLoader();
      const objectId = options.id || `obj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      loader.load(
        objPath,
        (object) => {
          const color = options.color 
            ? (typeof options.color === 'string' ? parseInt(options.color.replace('#', '0x')) : options.color)
            : this.config.modelColor;

          const originalMaterials = [];

          // Check if split colors should be used (MagCaseAssembled with colorB)
          const isMagCaseAssembled = decodeURIComponent(objPath).toLowerCase().replace(/[_\s]/g, '').includes('magcaseassembled');
          const useSplitColor = isMagCaseAssembled && options.colorB;
          let splitMaterial = null;
          
          if (useSplitColor) {
            const colorB = typeof options.colorB === 'string' 
              ? parseInt(options.colorB.replace('#', '0x')) 
              : options.colorB;
            splitMaterial = this.createSplitColorMaterial(color, colorB);
          }

          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (useSplitColor && splitMaterial) {
                child.material = splitMaterial;
              } else {
                child.material = new THREE.MeshPhongMaterial({
                  color: color,
                  shininess: 30,
                  emissive: 0x000000
                });
              }
              originalMaterials.push(child.material.clone());
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          const box = new THREE.Box3().setFromObject(object);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());

          object.position.sub(center);

          const innerGroup = new THREE.Group();
          innerGroup.add(object);

          const baseScale = options.scale || 1;
          if (this.config.useRealWorldScale) {
            innerGroup.scale.multiplyScalar(0.25 * baseScale);
          } else {
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = (2 / maxDim) * baseScale;
            innerGroup.scale.multiplyScalar(scale);
          }

          // Apply rotation - either from options or auto-detect based on model
          if (options.rotation) {
            innerGroup.rotation.x = options.rotation.x || 0;
            innerGroup.rotation.y = options.rotation.y || 0;
            innerGroup.rotation.z = options.rotation.z || 0;
          } else {
            // Auto-rotate certain models that need to be tilted back 90 degrees
            const normalizedPath = decodeURIComponent(objPath).toLowerCase().replace(/[_\s]/g, '-');
            const needsRotation = normalizedPath.includes('modular-stand') || normalizedPath.includes('weighted-base');
            if (needsRotation) {
              innerGroup.rotation.x = -Math.PI / 2; // Rotate 90 degrees backward
              //innerGroup.rotation.y = Math.PI / 2;  // Rotate 90 degrees clockwise toward wall
            }
          }

          const outerGroup = new THREE.Group();
          outerGroup.add(innerGroup);

          const scaledBox = new THREE.Box3().setFromObject(outerGroup);
          const scaledSize = scaledBox.getSize(new THREE.Vector3());

          // Calculate MagCaseAssembled depth for slot spacing (first time only)
          if (isMagCaseAssembled && this.assembledDepth === null) {
            this.assembledDepth = scaledSize.z;
            // Retroactively initialize slots for any existing weighted-bases
            this.sceneObjects.forEach(obj => {
              if (obj.objPath.toLowerCase().includes('weighted-base')) {
                this.initializeWeightedBaseSlots(obj);
              }
            });
          }

          const shelfTopY = -1.425;
          outerGroup.position.y = shelfTopY + scaledSize.y / 2;

          // Move MagCase_modular_stand objects closer to front edge of shelf
          if (decodeURIComponent(objPath).toLowerCase().replace(/[_\s]/g, '-').includes('modular-stand')) {
            outerGroup.position.z = 0.025;
          }

          if (typeof options.positionX === 'number') {
            outerGroup.position.x = options.positionX;
          } else {
            outerGroup.position.x = this.calculateNextPosition(scaledSize.x);
          }

          const sceneObject = {
            id: objectId,
            group: outerGroup,
            originalMaterials: originalMaterials,
            bounds: scaledSize,
            objPath: objPath,
            color: color,
            baseShelfY: outerGroup.position.y, // Store original shelf Y position
            name: options.name || objectId // Store product name for modal display
          };

          this.sceneObjects.push(sceneObject);
          this.scene.add(outerGroup);

          // Initialize shader uniforms for split-color materials
          if (useSplitColor) {
            this.updateSplitColorShaderUniforms(sceneObject);
          }

          // Initialize weighted-base slots if this is a weighted-base and depth is known
          const isWeightedBase = decodeURIComponent(objPath).toLowerCase().replace(/[_\s]/g, '-').includes('weighted-base');
          if (isWeightedBase && this.assembledDepth !== null) {
            this.initializeWeightedBaseSlots(sceneObject);
          }

          const event = new CustomEvent('objectAdded', {
            detail: { id: objectId, object: sceneObject }
          });
          this.container.dispatchEvent(event);

          resolve(sceneObject);
        },
        null,
        reject
      );
    });
  }

  /**
   * Calculate the next available X position for a new object (NEW)
   */
  calculateNextPosition(objectWidth) {
    if (this.sceneObjects.length === 0) {
      return 0;
    }

    let rightmostEdge = -Infinity;
    this.sceneObjects.forEach(obj => {
      const rightEdge = obj.group.position.x + obj.bounds.x / 2;
      if (rightEdge > rightmostEdge) {
        rightmostEdge = rightEdge;
      }
    });

    const padding = 0.3;
    const newX = rightmostEdge + padding + objectWidth / 2;

    const halfShelf = this.config.shelfWidth / 2;
    return Math.min(newX, halfShelf - objectWidth / 2);
  }

  /**
   * Remove an object from the scene by ID (NEW)
   */
  removeObjectFromScene(objectId) {
    const index = this.sceneObjects.findIndex(obj => obj.id === objectId);
    if (index === -1) return false;

    const obj = this.sceneObjects[index];

    if (this.selectedObject === obj) {
      this.deselectObject();
    }

    // Handle weighted-base removal (NEW - Multi-Slot Feature)
    const isWeightedBase = decodeURIComponent(obj.objPath).toLowerCase().replace(/[_\s]/g, '-').includes('weighted-base');
    if (isWeightedBase) {
      // Unsnap all MagCaseAssembled objects in this weighted-base's slots
      const slots = this.weightedBaseSlots.get(obj.id);
      if (slots) {
        slots.forEach(slot => {
          if (slot.assembledObj) {
            this.unsnapObject(slot.assembledObj);
          }
        });
        // Remove weighted-base from slots map
        this.weightedBaseSlots.delete(obj.id);
      }
    }

    // Handle MagCaseAssembled removal - free its slot if in weighted-base
    const slotInfo = this.assembledToSlot.get(obj.id);
    if (slotInfo) {
      const slots = this.weightedBaseSlots.get(slotInfo.baseId);
      if (slots && slots[slotInfo.slotIndex]) {
        slots[slotInfo.slotIndex].assembledObj = null;
      }
      this.assembledToSlot.delete(obj.id);
    }

    this.scene.remove(obj.group);

    obj.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });

    this.sceneObjects.splice(index, 1);

    const event = new CustomEvent('objectRemoved', { detail: { id: objectId } });
    this.container.dispatchEvent(event);

    return true;
  }

  /**
   * Clear all objects from the scene (NEW)
   */
  clearAllObjects() {
    this.deselectObject();

    this.sceneObjects.forEach(obj => {
      this.scene.remove(obj.group);
      obj.group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    });

    this.sceneObjects = [];

    const event = new CustomEvent('allObjectsCleared');
    this.container.dispatchEvent(event);
  }

  /**
   * Get all scene objects (NEW)
   */
  getSceneObjects() {
    return this.sceneObjects.map(obj => ({
      id: obj.id,
      position: { x: obj.group.position.x, y: obj.group.position.y, z: obj.group.position.z },
      bounds: { x: obj.bounds.x, y: obj.bounds.y, z: obj.bounds.z },
      objPath: obj.objPath,
      color: obj.color
    }));
  }

  /**
   * Move selected object to a specific X position (NEW)
   */
  moveSelectedObjectTo(x) {
    if (!this.selectedObject) return;

    const halfShelf = this.config.shelfWidth / 2;
    const objectHalfWidth = this.selectedObject.bounds.x / 2;
    const clampedX = Math.max(-halfShelf + objectHalfWidth, Math.min(halfShelf - objectHalfWidth, x));

    this.selectedObject.group.position.x = clampedX;
    this.updateSelectionIndicator();
  }

  /**
   * Auto-arrange all objects evenly on shelf (NEW)
   */
  autoArrangeObjects() {
    if (this.sceneObjects.length === 0) return;

    let totalWidth = 0;
    this.sceneObjects.forEach(obj => {
      totalWidth += obj.bounds.x;
    });

    const availableWidth = this.config.shelfWidth;
    const spacing = (availableWidth - totalWidth) / (this.sceneObjects.length + 1);

    let currentX = -availableWidth / 2;
    this.sceneObjects.forEach(obj => {
      currentX += spacing + obj.bounds.x / 2;
      obj.group.position.x = currentX;
      currentX += obj.bounds.x / 2;
    });

    this.updateSelectionIndicator();
  }

  /**
   * Change color of a specific scene object (NEW)
   */
  setSceneObjectColor(objectId, color) {
    const obj = this.sceneObjects.find(o => o.id === objectId);
    if (!obj) return;

    const hexColor = typeof color === 'string' ? parseInt(color.replace('#', '0x')) : color;
    obj.color = hexColor;

    obj.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material.color.setHex(hexColor);
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

    // Remove keyboard event listener
    if (this.eventHandlers && this.eventHandlers.onKeyDown) {
      document.removeEventListener('keydown', this.eventHandlers.onKeyDown);
    }

    // Remove focus/blur event listeners
    if (this.eventHandlers && this.container) {
      if (this.eventHandlers.onFocus) {
        this.container.removeEventListener('focus', this.eventHandlers.onFocus);
      }
      if (this.eventHandlers.onBlur) {
        this.container.removeEventListener('blur', this.eventHandlers.onBlur);
      }
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

    // Clean up scene objects (NEW)
    this.clearAllObjects();

    if (this.shelf) {
      this.scene.remove(this.shelf);
      this.shelf.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    }

    // Clean up selection indicator (NEW)
    if (this.selectionIndicator) {
      this.scene.remove(this.selectionIndicator);
      this.selectionIndicator.geometry.dispose();
      this.selectionIndicator.material.dispose();
    }
    
    this.renderer.dispose();
    
    if (this.container && this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
