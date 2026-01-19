import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export function useClipping(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    cameraRef: React.MutableRefObject<THREE.Camera | null>,
    rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>,
    controlsRef: React.MutableRefObject<any>
) {
    const [isClippingActive, setIsClippingActive] = useState(false);
    
    // The actual math plane used by Three.js
    const planeRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    
    // Visual helpers
    const planeMeshRef = useRef<THREE.Mesh | null>(null);
    const transformControlsRef = useRef<TransformControls | null>(null);
    const arrowHelperRef = useRef<THREE.ArrowHelper | null>(null);

    // Update the math plane based on the visual mesh
    const updatePlaneFromMesh = useCallback(() => {
        if (!planeMeshRef.current || !planeRef.current) return;

        const mesh = planeMeshRef.current;
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
        const point = mesh.position;
        
        // Plane constant d = -normal . point
        const constant = -normal.dot(point);
        
        planeRef.current.normal.copy(normal);
        planeRef.current.constant = constant;
    }, []);

    // Apply clipping planes to materials based on lock status
    const updateMaterials = useCallback(() => {
        if (!sceneRef.current) return;

        const plane = isClippingActive && planeRef.current ? [planeRef.current] : [];

        sceneRef.current.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.isModelMesh) {
                // If layer is locked, do not clip
                if (child.userData.isLocked) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.clippingPlanes = []);
                    } else {
                        child.material.clippingPlanes = [];
                    }
                } else {
                    // Apply clipping plane
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => {
                            m.clippingPlanes = plane;
                            m.clipShadows = true; 
                            m.onBeforeCompile = (shader: THREE.Shader) => {
                                shader.fragmentShader = shader.fragmentShader.replace(
                                    '#include <clipping_planes_fragment>',
                                    `
                                    #if NUM_CLIPPING_PLANES > 0
                                        vec4 plane;
                                        #pragma unroll_loop_start
                                        for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
                                            plane = clippingPlanes[ i ];
                                            if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
                                            if ( dot( vClipPosition, plane.xyz ) > plane.w - 0.1 ) {
                                                gl_FragColor = vec4( 0.2, 0.2, 0.2, 1.0 );
                                                return;
                                            }
                                        }
                                        #pragma unroll_loop_end
                                    #endif
                                    `
                                );
                            };
                            m.needsUpdate = true;
                        });
                    } else {
                        child.material.clippingPlanes = plane;
                        child.material.clipShadows = true;
                        child.material.onBeforeCompile = (shader: THREE.Shader) => {
                            shader.fragmentShader = shader.fragmentShader.replace(
                                '#include <clipping_planes_fragment>',
                                `
                                #if NUM_CLIPPING_PLANES > 0
                                    vec4 plane;
                                    #pragma unroll_loop_start
                                    for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
                                        plane = clippingPlanes[ i ];
                                        if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
                                        if ( dot( vClipPosition, plane.xyz ) > plane.w - 0.1 ) {
                                            gl_FragColor = vec4( 0.2, 0.2, 0.2, 1.0 );
                                            return;
                                        }
                                    }
                                    #pragma unroll_loop_end
                                #endif
                                `
                            );
                        };
                        child.material.needsUpdate = true;
                    }
                }
            } else if (child instanceof THREE.LineSegments && child.name === 'SurfaceEdge') {
                 const parentLocked = child.parent?.userData?.isLocked;
                 if (parentLocked) {
                     (child.material as THREE.LineBasicMaterial).clippingPlanes = [];
                 } else {
                     (child.material as THREE.LineBasicMaterial).clippingPlanes = plane;
                 }
            }
        });
    }, [isClippingActive]);

    const toggleClipping = useCallback(() => {
        if (isClippingActive) {
            // Disable
            setIsClippingActive(false);
            
            // Remove helpers
            if (sceneRef.current && planeMeshRef.current) {
                sceneRef.current.remove(planeMeshRef.current);
                planeMeshRef.current = null;
            }
            if (sceneRef.current && transformControlsRef.current) {
                transformControlsRef.current.detach();
                sceneRef.current.remove(transformControlsRef.current);
                transformControlsRef.current.dispose();
                transformControlsRef.current = null;
            }
            if (sceneRef.current && arrowHelperRef.current) {
                sceneRef.current.remove(arrowHelperRef.current);
                arrowHelperRef.current = null;
            }

            // Clear planes from materials
            if (sceneRef.current) {
                sceneRef.current.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.userData.isModelMesh) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.clippingPlanes = []);
                        } else {
                            child.material.clippingPlanes = [];
                        }
                    }
                });
            }

        } else {
            // Enable
            setIsClippingActive(true);

            if (!sceneRef.current || !rendererRef.current || !cameraRef.current) return;

            // 1. Create Plane Mesh (Visual)
            const geometry = new THREE.PlaneGeometry(20, 20);
            const material = new THREE.MeshBasicMaterial({ 
                color: 0xffff00, 
                side: THREE.DoubleSide, 
                transparent: true, 
                opacity: 0.2,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = "ClippingPlaneHelper";
            mesh.position.set(0, 0, 0);
            mesh.lookAt(0, -1, 0); // Default normal up? 
            // Default plane is (0,1,0), so normal is Y+.
            // PlaneGeometry is in XY plane (normal Z+). 
            // To make mesh normal Y+, rotate -90 deg around X.
            mesh.rotation.x = -Math.PI / 2;

            sceneRef.current.add(mesh);
            planeMeshRef.current = mesh;

            // 2. Add Frame Helper for the plane
            const edges = new THREE.EdgesGeometry(geometry);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffff00 }));
            mesh.add(line);

            // 3. Add Arrow Helper for normal
            const arrowDir = new THREE.Vector3(0, 0, 1);
            const arrowOrigin = new THREE.Vector3(0, 0, 0);
            const arrowLen = 5;
            const arrowColor = 0xffff00;
            const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowOrigin, arrowLen, arrowColor);
            mesh.add(arrowHelper); // Attached to mesh, so it rotates with it

            // 4. Setup TransformControls
            const control = new TransformControls(cameraRef.current, rendererRef.current.domElement);
            control.attach(mesh);
            sceneRef.current.add(control);
            transformControlsRef.current = control;

            // 5. Setup Events
            control.addEventListener('dragging-changed', (event) => {
                if (controlsRef.current) {
                    controlsRef.current.enabled = !event.value;
                }
            });

            control.addEventListener('change', () => {
                updatePlaneFromMesh();
            });

            // Initial sync
            updatePlaneFromMesh();
        }
    }, [isClippingActive, updatePlaneFromMesh, sceneRef, cameraRef, rendererRef, controlsRef]);

    const flipClipping = useCallback(() => {
        if (!planeMeshRef.current) return;
        planeMeshRef.current.rotateX(Math.PI);
        updatePlaneFromMesh();
        updateMaterials();
    }, [updatePlaneFromMesh, updateMaterials]);

    const alignToAxis = useCallback((axis: 'x' | 'y' | 'z') => {
        if (!planeMeshRef.current) return;
        const mesh = planeMeshRef.current;
        
        // Reset rotation first
        mesh.rotation.set(0, 0, 0);

        // PlaneGeometry normal is +Z (0,0,1)
        if (axis === 'x') {
            // Align +Z to +X: Rotate Y +90
            mesh.rotation.y = Math.PI / 2;
        } else if (axis === 'y') {
            // Align +Z to +Y: Rotate X -90
            mesh.rotation.x = -Math.PI / 2;
        } else if (axis === 'z') {
            // Align +Z to +Z: No rotation
        }

        updatePlaneFromMesh();
        updateMaterials();
    }, [updatePlaneFromMesh, updateMaterials]);

    // Update materials whenever active state changes or external trigger
    useEffect(() => {
        updateMaterials();
    }, [updateMaterials]);

    return {
        isClippingActive,
        toggleClipping,
        updateMaterials,
        flipClipping,
        alignToAxis,
        clippingPlanes: isClippingActive && planeRef.current ? [planeRef.current] : []
    };
}
