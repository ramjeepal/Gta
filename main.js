import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => {
    if (url.includes('colormap.png')) return 'colormap.png'; 
    return url;
});

const loader = new GLTFLoader(manager);
const texLoader = new THREE.TextureLoader();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); 
scene.fog = new THREE.Fog(0x87CEEB, 100, 3000); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const vehicles = []; 
const collidableMeshes = []; 
const raycaster = new THREE.Raycaster();

// ==========================================
// 1. MEGA CITY BUILDER
// ==========================================
function createWorld() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(200, 500, 200);
    scene.add(sunLight);

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(30000, 30000),
        new THREE.MeshLambertMaterial({ color: 0x44aa44 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    collidableMeshes.push(ground); 

    const tracks = ['roadStart.glb', 'roadStraight.glb', 'roadRamp.glb', 'roadCornerLarge.glb'];
    tracks.forEach((m, i) => {
        loader.load(m, (gltf) => {
            const piece = gltf.scene;
            piece.scale.set(12, 12, 12);
            piece.position.set(0, 0.1, -i * 60);
            scene.add(piece);
        });
    });

    const buildingList = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t'];
    const streetOffsets = [-250, -110, 110, 250]; 
    
    streetOffsets.forEach((xPos) => {
        buildingList.forEach((char, i) => {
            loader.load(`building-${char}.glb`, (gltf) => {
                const obj = gltf.scene;
                const baseScale = 20 + Math.random() * 10;
                const heightBoost = baseScale * (1 + Math.random() * 1.5); 
                obj.scale.set(baseScale, heightBoost, baseScale); 
                obj.position.set(xPos, 0, -i * 80 - Math.random() * 50);
                scene.add(obj);

                obj.traverse(child => {
                    if (child.isMesh) collidableMeshes.push(child);
                });
            });
        });
    });

    const models = ['police.glb', 'ambulance.glb', 'tractor.glb', 'taxi.glb', 'suv.glb', 'firetruck.glb'];
    models.forEach((name, i) => {
        loader.load(name, (gltf) => {
            const v = gltf.scene;
            v.scale.set(4, 4, 4);
            v.position.set(25, 0.5, -i * 50);
            scene.add(v);
            vehicles.push(v);
        });
    });
}

// ==========================================
// 2. PLAYER & PHYSICS
// ==========================================
class Player {
    constructor() {
        this.mesh = new THREE.Group();
        scene.add(this.mesh);
        
        loader.load('player.glb', (gltf) => {
            this.model = gltf.scene;
            this.model.scale.set(4, 4, 4);
            const tex = texLoader.load('humanMaleA.png');
            tex.flipY = false;
            this.model.traverse(node => { if (node.isMesh) node.material = new THREE.MeshLambertMaterial({ map: tex }); });
            this.mesh.add(this.model);
        }, undefined, (e) => {
            this.model = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), new THREE.MeshLambertMaterial({color: 0xff0000}));
            this.model.position.y = 4;
            this.mesh.add(this.model);
        });

        this.move = { f: false, b: false, l: false, r: false, flying: false };
        this.inCar = false;
        this.currentCar = null;
        this.velocityY = 0; 
        this.setupButtons();
    }

    setupButtons() {
        const bind = (id, dir) => {
            const btn = document.getElementById(id);
            if(!btn) return;
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.move[dir] = true; }, {passive:false});
            btn.addEventListener('touchend', (e) => { e.preventDefault(); this.move[dir] = false; }, {passive:false});
        };
        bind('btn-up', 'f'); bind('btn-down', 'b');
        bind('btn-left', 'l'); bind('btn-right', 'r');
        bind('btn-jump', 'flying');

        document.getElementById('btn-enter')?.addEventListener('touchstart', (e) => {
            e.preventDefault(); this.toggleVehicle();
        });
    }

    toggleVehicle() {
        if(this.inCar) {
            this.inCar = false;
            this.mesh.position.copy(this.currentCar.position);
            this.mesh.position.x += 15;
            this.mesh.visible = true;
            this.currentCar = null;
        } else {
            let near = vehicles.find(v => this.mesh.position.distanceTo(v.position) < 35);
            if(near) {
                this.inCar = true;
                this.currentCar = near;
                this.mesh.visible = false;
            }
        }
    }

    update() {
        const speed = this.inCar ? 3.5 : 1.5;
        const target = this.inCar ? this.currentCar : this.mesh;

        let floorY = 0;
        raycaster.set(new THREE.Vector3(target.position.x, target.position.y + 10, target.position.z), new THREE.Vector3(0, -1, 0));
        let downHits = raycaster.intersectObjects(collidableMeshes, false);
        
        if (downHits.length > 0) {
            floorY = downHits[0].point.y; 
        }
        if (this.inCar) floorY += 0.5; 

        if (this.move.flying) {
            this.velocityY = 2.0; 
        } else {
            this.velocityY -= 0.2; 
            if (this.velocityY < -4.0) this.velocityY = -4.0; 
        }
        target.position.y += this.velocityY;

        if (target.position.y <= floorY) {
            target.position.y = floorY;
            this.velocityY = 0;
        }

        let moveX = 0;
        let moveZ = 0;

        if(this.move.f) {
            moveZ -= Math.cos(target.rotation.y) * speed;
            moveX -= Math.sin(target.rotation.y) * speed;
        }
        if(this.move.b) {
            moveZ += Math.cos(target.rotation.y) * speed;
            moveX += Math.sin(target.rotation.y) * speed;
        }

        if (moveX !== 0 || moveZ !== 0) {
            let moveDir = new THREE.Vector3(moveX, 0, moveZ).normalize();
            raycaster.set(new THREE.Vector3(target.position.x, target.position.y + 3, target.position.z), moveDir);
            let fwdHits = raycaster.intersectObjects(collidableMeshes, false);

            if (fwdHits.length > 0 && fwdHits[0].distance < (speed + 4)) {
                // टक्कर! रुक जाओ
            } else {
                target.position.x += moveX;
                target.position.z += moveZ;
            }
        }

        if(this.move.l) target.rotation.y += 0.06;
        if(this.move.r) target.rotation.y -= 0.06;
    }
}

// ==========================================
// 3. ENGINE LOOP & PERFECT CAMERA
// ==========================================
createWorld();
const player = new Player();

function animate() {
    requestAnimationFrame(animate);
    player.update();
    
    const target = player.inCar ? player.currentCar : player.mesh;
    
    // 🎥 नया कैमरा सेटअप (Player के एकदम पास)
    const camDist = player.inCar ? 35 : 20; // पैदल है तो 20 पास, गाड़ी में 35
    const camHeight = player.inCar ? 12 : 7; // पैदल है तो 7 ऊँचा, गाड़ी में 12

    const offset = new THREE.Vector3(0, camHeight, camDist);
    offset.applyQuaternion(target.quaternion);
    
    // कैमरा को स्मूथली प्लेयर के पीछे ले जाना
    camera.position.lerp(target.position.clone().add(offset), 0.15); 
    
    // कैमरा को हमेशा प्लेयर के सिर/छाती की तरफ देखने के लिए सेट करना
    camera.lookAt(target.position.x, target.position.y + 5, target.position.z);

    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});