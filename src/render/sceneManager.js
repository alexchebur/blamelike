// @ts-check
import * as THREE from 'three';
import defaultConfig from '../core/config.js';
import ScreenManager from './screenManager.js';
import PlayerController from '../physics/playerController.js';

class SceneManager {
    constructor(container) {
        this.container = container;
        this.config = { ...defaultConfig };
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.PI_2 = Math.PI / 2;
        
        this.prevTime = performance.now();

        this.directionalLight = null;
        this.hemisphereLight = null;
        this.fog = null;
        this.axisHelper = null;

        this.screenManager = null;
        
        this.collisionLayer = new THREE.Group();
        this.collisionLayer.name = "CollisionLayer";
        
        this.playerController = null; 

        this.init();
        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('contextmenu', event => event.preventDefault());
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW': if (this.playerController) this.playerController.moveForward = true; break;
            case 'KeyA': if (this.playerController) this.playerController.moveLeft = true; break;
            case 'KeyS': if (this.playerController) this.playerController.moveBackward = true; break;
            case 'KeyD': if (this.playerController) this.playerController.moveRight = true; break;
            case 'Space': if (this.playerController) this.playerController.jump = true; break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW': if (this.playerController) this.playerController.moveForward = false; break;
            case 'KeyA': if (this.playerController) this.playerController.moveLeft = false; break;
            case 'KeyS': if (this.playerController) this.playerController.moveBackward = false; break;
            case 'KeyD': if (this.playerController) this.playerController.moveRight = false; break;
            case 'Space': if (this.playerController) this.playerController.jump = false; break;
        }
    }

    onMouseMove(event) {
        if (this.playerController) {
            this.playerController.onMouseMove(event.movementX || 0, event.movementY || 0);
        }
    }

    onMouseDown(event) {
        if (event.button === 2 && this.playerController) {
            this.playerController.jump = true;
        }
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        this.updateFog();
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.up.set(0, 1, 0); 
        this.camera.position.set(0, 50, 100); 
        
        this.euler.set(0, 0, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this.euler);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = this.config.enableShadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.axisHelper = new THREE.AxesHelper(30);
        this.scene.add(this.axisHelper);
        
        this.scene.add(this.collisionLayer);

        this.setupLighting();
        
        this.screenManager = new ScreenManager(this.scene);
        this.playerController = new PlayerController(this, this.config);
        
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLighting() {
        this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(this.hemisphereLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(100, 200, 100);
        this.directionalLight.castShadow = this.config.enableShadows;
        this.scene.add(this.directionalLight);
    }

    updateFog() {
        if (this.fog) this.scene.fog = null;
        this.fog = new THREE.FogExp2(this.config.backgroundColor, this.config.fogDensity);
        this.scene.fog = this.fog;
    }

    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        this.scene.background = new THREE.Color(this.config.backgroundColor);
        this.updateFog();
        this.renderer.shadowMap.enabled = this.config.enableShadows;
        if (this.directionalLight) this.directionalLight.castShadow = this.config.enableShadows;
        
        if (this.playerController) {
            this.playerController.speed = (this.config.moveSpeed || 50) / 1.5;
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;
        this.prevTime = time;

        if (this.playerController && this.camera) {
            this.playerController.update(delta, this.camera);
        }

        if (this.axisHelper && this.camera) {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            const axisPos = new THREE.Vector3().copy(this.camera.position).add(direction.multiplyScalar(60)); 
            this.axisHelper.position.copy(axisPos);
        }

        if (this.screenManager) {
            this.screenManager.update();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

export default SceneManager;
