import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

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

    // Stencil helpers
    const stencilGroupRef = useRef<THREE.Group | null>(null);

    // Rebuild the stencil group (call this when layers visibility changes or enabling clipping)
    const rebuildStencil = useCallback(() => {
        if (!isClippingActive || !sceneRef.current || !planeRef.current) {
             if (stencilGroupRef.current) {
                 sceneRef.current?.remove(stencilGroupRef.current);
                 stencilGroupRef.current = null;
             }
             return;
        }

        // 1. Create Stencil Group if needed
        if (!stencilGroupRef.current) {
            const group = new THREE.Group();
            group.renderOrder = -1; // Draw first to populate stencil buffer
            sceneRef.current.add(group);
            stencilGroupRef.current = group;
        }

        const group = stencilGroupRef.current;
        group.clear();
        const plane = planeRef.current;

        // 2. Traverse and clone visible unlocked meshes
        sceneRef.current.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.isModelMesh) {
                if (child.userData.isLocked || !child.visible) return;
                
                const geometry = child.geometry;
                const matrixWorld = child.matrixWorld;

                // Back faces -> Increment
                const mat0 = new THREE.MeshBasicMaterial({
                    depthWrite: false,
                    depthTest: false,
                    colorWrite: false,
                    stencilWrite: true,
                    stencilFunc: THREE.AlwaysStencilFunc,
                    side: THREE.BackSide,
                    stencilFail: THREE.IncrementWrapStencilOp,
                    stencilZFail: THREE.IncrementWrapStencilOp,
                    stencilZPass: THREE.IncrementWrapStencilOp,
                    clippingPlanes: [plane]
                });

                const mesh0 = new THREE.Mesh(geometry, mat0);
                mesh0.matrixAutoUpdate = false;
                mesh0.matrix.copy(matrixWorld);
                mesh0.userData.isStencil = true;
                mesh0.raycast = () => {};
                group.add(mesh0);

                // Front faces -> Decrement
                const mat1 = new THREE.MeshBasicMaterial({
                    depthWrite: false,
                    depthTest: false,
                    colorWrite: false,
                    stencilWrite: true,
                    stencilFunc: THREE.AlwaysStencilFunc,
                    side: THREE.FrontSide,
                    stencilFail: THREE.DecrementWrapStencilOp,
                    stencilZFail: THREE.DecrementWrapStencilOp,
                    stencilZPass: THREE.DecrementWrapStencilOp,
                    clippingPlanes: [plane]
                });

                const mesh1 = new THREE.Mesh(geometry, mat1);
                mesh1.matrixAutoUpdate = false;
                mesh1.matrix.copy(matrixWorld);
                mesh1.userData.isStencil = true;
                mesh1.raycast = () => {};
                group.add(mesh1);
            }
        });

    }, [isClippingActive, sceneRef, planeRef]);

    // Trigger rebuildStencil when clipping becomes active
    useEffect(() => {
        rebuildStencil();
        return () => {
            // Cleanup when unmounting or dependencies change (if needed)
            // rebuildStencil handles cleanup if !isClippingActive
        };
    }, [rebuildStencil]);

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
                            m.onBeforeCompile = (shader: any) => {
                                shader.fragmentShader = shader.fragmentShader.replace(
                                    '#include <clipping_planes_fragment>',
                                    `
                                    #if NUM_CLIPPING_PLANES > 0
                                        vec4 plane;
                                        #pragma unroll_loop_start
                                        for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
                                            plane = clippingPlanes[ i ];
                                            if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
                                            
                                            // Calculate distance to the clipping plane
                                            float dist = plane.w - dot( vClipPosition, plane.xyz );
                                            // Use fwidth to create a constant screen-space width line (approx 2px)
                                            // fwidth(dist) is the change of distance per pixel
                                            if ( dist < 2.0 * fwidth( dist ) ) {
                                                gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
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
                        child.material.onBeforeCompile = (shader: any) => {
                            shader.fragmentShader = shader.fragmentShader.replace(
                                '#include <clipping_planes_fragment>',
                                `
                                #if NUM_CLIPPING_PLANES > 0
                                    vec4 plane;
                                    #pragma unroll_loop_start
                                    for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
                                        plane = clippingPlanes[ i ];
                                        if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
                                        
                                        // Calculate distance to the clipping plane
                                        float dist = plane.w - dot( vClipPosition, plane.xyz );
                                        // Use fwidth to create a constant screen-space width line (approx 2px)
                                        // fwidth(dist) is the change of distance per pixel
                                        if ( dist < 2.0 * fwidth( dist ) ) {
                                            gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
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
        void (async () => {
            if (isClippingActive) {
                setIsClippingActive(false);
                
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
                return;
            }

            setIsClippingActive(true);

            if (!sceneRef.current || !rendererRef.current || !cameraRef.current) return;

            const geometry = new THREE.PlaneGeometry(10, 10);
            const material = new THREE.MeshBasicMaterial({ 
                color: 0xffff00, 
                side: THREE.DoubleSide, 
                transparent: true, 
                opacity: 0.2,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = "ClippingPlaneHelper";
            
            if (controlsRef.current && controlsRef.current.target) {
                mesh.position.copy(controlsRef.current.target);
            } else {
                mesh.position.set(0, 0, 0);
            }
            
            mesh.rotation.set(-Math.PI / 2, 0, 0);

            sceneRef.current.add(mesh);
            planeMeshRef.current = mesh;

            const capGeometry = new THREE.PlaneGeometry(1000, 1000);
            const capMaterial = new THREE.MeshBasicMaterial({
                color: 0x333333,
                stencilWrite: true,
                stencilFunc: THREE.NotEqualStencilFunc,
                stencilRef: 0,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const capMesh = new THREE.Mesh(capGeometry, capMaterial);
            capMesh.renderOrder = 1;
            capMesh.name = "ClippingCapMesh";
            mesh.add(capMesh);

            const edges = new THREE.EdgesGeometry(geometry);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffff00 }));
            mesh.add(line);

            const arrowDir = new THREE.Vector3(0, 0, 1);
            const arrowOrigin = new THREE.Vector3(0, 0, 0);
            const arrowLen = 5;
            const arrowColor = 0xffff00;
            const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowOrigin, arrowLen, arrowColor);
            mesh.add(arrowHelper);

            const mod = await import('three/examples/jsm/controls/TransformControls.js');
            const control = new mod.TransformControls(cameraRef.current, rendererRef.current.domElement);
            control.attach(mesh);
            sceneRef.current.add(control);
            transformControlsRef.current = control;

            control.addEventListener('dragging-changed', (event) => {
                if (controlsRef.current) {
                    controlsRef.current.enabled = !event.value;
                }
            });

            control.addEventListener('change', () => {
                updatePlaneFromMesh();
            });

            updatePlaneFromMesh();
        })();
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
        clippingPlanes: isClippingActive && planeRef.current ? [planeRef.current] : [],
        rebuildStencil
    };
}
