import {
	BufferGeometryLoader,
	ClampToEdgeWrapping,
	Color,
	DoubleSide,
	FileLoader,
	Loader,
	Matrix4,
	Mesh,
	Group,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	Object3D,
	RepeatWrapping,
	TextureLoader,
	EquirectangularReflectionMapping,
	SRGBColorSpace
} from 'three';

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

const _taskCache = new WeakMap();

/**
 * A loader for Rhinoceros 3D files and objects.
 *
 * Rhinoceros is a 3D modeler used to create, edit, analyze, document, render,
 * animate, and translate NURBS curves, surfaces, breps, extrusions, point clouds,
 * as well as polygon meshes and SubD objects. `rhino3dm.js` is compiled to WebAssembly
 * from the open source geometry library `openNURBS`. The loader currently uses
 * `rhino3dm.js 8.4.0`.
 *
 * ```js
 * const loader = new HD3DMLoader();
 * loader.setLibraryPath( 'https://cdn.jsdelivr.net/npm/rhino3dm@8.0.1' );
 *
 * const object = await loader.loadAsync( 'models/3dm/Rhino_Logo.3dm' );
 * scene.add( object );
 * ```
 *
 * @augments Loader
 * @three_import import { HD3DMLoader } from '../lib/loader/HD3DMLoader.js';
 */
class HD3DMLoader extends Loader {

	/**
	 * Constructs a new Rhino 3DM loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		// internals

		this.libraryPath = '';
		this.libraryPending = null;
		this.libraryBinary = null;
		this.libraryConfig = {};

		this.url = '';

		this.workerLimit = 4;
		this.workerPool = [];
		this.workerNextTaskID = 1;
		this.workerSourceURL = '';
		this.workerConfig = {};

		this.materials = [];
		this.warnings = [];

	}

	/**
	 * Path to a folder containing the JS and WASM libraries.
	 *
	 * @param {string} path - The library path to set.
	 * @return {HD3DMLoader} A reference to this loader.
	 */
	setLibraryPath( path ) {

		this.libraryPath = path;

		return this;

	}

	/**
	 * Sets the maximum number of Web Workers to be used during decoding.
	 * A lower limit may be preferable if workers are also for other
	 * tasks in the application.
	 *
	 * @param {number} workerLimit - The worker limit.
	 * @return {HD3DMLoader} A reference to this loader.
	 */
	setWorkerLimit( workerLimit ) {

		this.workerLimit = workerLimit;

		return this;

	}

	/**
	 * Starts loading from the given URL and passes the loaded 3DM asset
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function(Object3D)} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		const loader = new FileLoader( this.manager );

		loader.setPath( this.path );
		loader.setResponseType( 'arraybuffer' );
		loader.setRequestHeader( this.requestHeader );

		this.url = url;

		loader.load( url, ( buffer ) => {

			// Check for an existing task using this buffer. A transferred buffer cannot be transferred
			// again from this thread.
			if ( _taskCache.has( buffer ) ) {

				const cachedTask = _taskCache.get( buffer );

				return cachedTask.promise.then( onLoad ).catch( onError );

			}

			this.decodeObjects( buffer, url )
				.then( result => {

					result.userData.warnings = this.warnings;
					onLoad( result );

				 } )
				.catch( e => onError( e ) );

		}, onProgress, onError );

	}

	/**
	 * Prints debug messages to the browser console.
	 */
	debug() {

		console.log( 'Task load: ', this.workerPool.map( ( worker ) => worker._taskLoad ) );

	}

	/**
	 * Decodes the 3DM asset data with a Web Worker.
	 *
	 * @param {ArrayBuffer} buffer - The raw 3DM asset data as an array buffer.
	 * @param {string} url - The asset URL.
	 * @return {Promise<Object3D>} A Promise that resolved with the decoded 3D object.
	 */
	decodeObjects( buffer, url ) {

		let worker;
		let taskID;

		const taskCost = buffer.byteLength;

		const objectPending = this._getWorker( taskCost )
			.then( ( _worker ) => {

				worker = _worker;
				taskID = this.workerNextTaskID ++;

				return new Promise( ( resolve, reject ) => {

					worker._callbacks[ taskID ] = { resolve, reject };

					worker.postMessage( { type: 'decode', id: taskID, buffer }, [ buffer ] );

					// this.debug();

				} );

			} )
			.then( ( message ) => this._createGeometry( message.data ) )
			.catch( e => {

				throw e;

			} );

		// Remove task from the task list.
		// Note: replaced '.finally()' with '.catch().then()' block - iOS 11 support (#19416)
		objectPending
			.catch( () => true )
			.then( () => {

				if ( worker && taskID ) {

					this._releaseTask( worker, taskID );

					//this.debug();

				}

			} );

		// Cache the task result.
		_taskCache.set( buffer, {

			url: url,
			promise: objectPending

		} );

		return objectPending;

	}

	/**
	 * Parses the given 3DM data and passes the loaded 3DM asset
	 * to the `onLoad()` callback.
	 *
	 * @param {ArrayBuffer} data - The raw 3DM asset data as an array buffer.
	 * @param {function(Object3D)} onLoad - Executed when the loading process has been finished.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	parse( data, onLoad, onError ) {

		this.decodeObjects( data, '' )
			.then( result => {

				result.userData.warnings = this.warnings;
				onLoad( result );

			} )
			.catch( e => onError( e ) );

	}
	_compareMaterials( material ) {

		const mat = {};
		mat.name = material.name;
		mat.color = {};
		mat.color.r = material.color.r;
		mat.color.g = material.color.g;
		mat.color.b = material.color.b;
		mat.type = material.type;
		mat.vertexColors = material.vertexColors;

		const json = JSON.stringify( mat );

		for ( let i = 0; i < this.materials.length; i ++ ) {

			const m = this.materials[ i ];
			const _mat = {};
			_mat.name = m.name;
			_mat.color = {};
			_mat.color.r = m.color.r;
			_mat.color.g = m.color.g;
			_mat.color.b = m.color.b;
			_mat.type = m.type;
			_mat.vertexColors = m.vertexColors;

			if ( JSON.stringify( _mat ) === json ) {

				return m;

			}

		}

		this.materials.push( material );

		return material;

	}

	_createMaterial( material, renderEnvironment ) {

		if ( material === undefined ) {

			return new MeshStandardMaterial( {
				color: new Color( 1, 1, 1 ),
				metalness: 0.8,
				name: Loader.DEFAULT_MATERIAL_NAME,
				side: DoubleSide
			} );

		}

		//console.log(material)

		const mat = new MeshPhysicalMaterial( {

			color: new Color( material.diffuseColor.r / 255.0, material.diffuseColor.g / 255.0, material.diffuseColor.b / 255.0 ),
			emissive: new Color( material.emissionColor.r, material.emissionColor.g, material.emissionColor.b ),
			flatShading: material.disableLighting,
			ior: material.indexOfRefraction,
			name: material.name,
			reflectivity: material.reflectivity,
			opacity: 1.0 - material.transparency,
			side: DoubleSide,
			specularColor: material.specularColor,
			transparent: material.transparency > 0 ? true : false

		} );

		mat.userData.id = material.id;

		if ( material.pbrSupported ) {

			const pbr = material.pbr;

			mat.anisotropy = pbr.anisotropic;
			mat.anisotropyRotation = pbr.anisotropicRotation;
			mat.color = new Color( pbr.baseColor.r, pbr.baseColor.g, pbr.baseColor.b );
			mat.clearcoat = pbr.clearcoat;
			mat.clearcoatRoughness = pbr.clearcoatRoughness;
			mat.metalness = pbr.metallic;
			mat.transmission = 1 - pbr.opacity;
			mat.roughness = pbr.roughness;
			mat.sheen = pbr.sheen;
			mat.specularIntensity = pbr.specular;
			mat.thickness = pbr.subsurface;

		}

		if ( material.pbrSupported && material.pbr.opacity === 0 && material.transparency === 1 ) {

			//some compromises

			mat.opacity = 0.2;
			mat.transmission = 1.00;

		}


		const textureLoader = new TextureLoader( /*this.manager*/ );
		/*
		const resolveTextureUrl = ( url ) => {

			if ( ! url || typeof url !== 'string' ) return url;
			if ( url.startsWith( 'data:' ) || url.startsWith( 'blob:' ) || url.startsWith( 'http://' ) || url.startsWith( 'https://' ) ) return url;

			const normalized = url.replace( /\\/g, '/' );
			const fileName = normalized.split( '/' ).pop() || normalized;
			const decodedFull = decodeURIComponent( normalized );
			const decodedName = decodeURIComponent( fileName );
			const candidates = [ decodedFull, decodedName, normalized, fileName, url ];

			for ( let idx = 0; idx < candidates.length; idx ++ ) {

				const candidate = candidates[ idx ];
				if ( this.manager && typeof this.manager.resolveURL === 'function' ) {

					const resolved = this.manager.resolveURL( candidate );
					if ( resolved && resolved !== candidate ) return resolved;

				}

			}

			if ( this.manager && typeof this.manager.resolveURL === 'function' ) {

				return this.manager.resolveURL( normalized );

			}

			return normalized;

		};*/

		for ( let i = 0; i < material.textures.length; i ++ ) {
			const texture = material.textures[ i ];

			if ( texture.image !== null ) {

				const map = textureLoader.load( texture.image );

				//console.log(texture.type )

				switch ( texture.type ) {

					case 'Bump':

						mat.bumpMap = map;

						break;

					case 'Diffuse':

						mat.map = map;

						break;

					case 'Emap':

						mat.envMap = map;

						break;

					case 'Opacity':

						mat.transmissionMap = map;

						break;

					case 'Transparency':

						mat.alphaMap = map;
						mat.transparent = true;

						break;

					case 'PBR_Alpha':

						mat.alphaMap = map;
						mat.transparent = true;

						break;

					case 'PBR_AmbientOcclusion':

						mat.aoMap = map;

						break;

					case 'PBR_Anisotropic':

						mat.anisotropyMap = map;

						break;

					case 'PBR_BaseColor':

						mat.map = map;

						break;

					case 'PBR_Clearcoat':

						mat.clearcoatMap = map;

						break;

					case 'PBR_ClearcoatBump':

						mat.clearcoatNormalMap = map;

						break;

					case 'PBR_ClearcoatRoughness':

						mat.clearcoatRoughnessMap = map;

						break;

					case 'PBR_Displacement':

						mat.displacementMap = map;

						break;

					case 'PBR_Emission':

						mat.emissiveMap = map;

						break;

					case 'PBR_Metallic':

						mat.metalnessMap = map;

						break;

					case 'PBR_Roughness':

						mat.roughnessMap = map;

						break;

					case 'PBR_Sheen':

						mat.sheenColorMap = map;

						break;

					case 'PBR_Specular':

						mat.specularColorMap = map;

						break;

					case 'PBR_Subsurface':

						mat.thicknessMap = map;

						break;

					default:

						this.warnings.push( {
							message: `THREE.3DMLoader: No conversion exists for 3dm ${texture.type}.`,
							type: 'no conversion'
						} );

						break;

				}

				map.wrapS = texture.wrapU === 0 ? RepeatWrapping : ClampToEdgeWrapping;
				map.wrapT = texture.wrapV === 0 ? RepeatWrapping : ClampToEdgeWrapping;

				if ( texture.repeat ) {

					map.repeat.set( texture.repeat[ 0 ], texture.repeat[ 1 ] );

				}
			}
		}

		if ( renderEnvironment ) {

			new EXRLoader().load( renderEnvironment.image, function ( texture ) {

				texture.mapping = EquirectangularReflectionMapping;
				mat.envMap = texture;

			} );

		}
		return mat;

	}

	_createGeometry( data ) {

		const object = new Object3D();
		
		let scaleFactor = 1.0;
		if ( data.settings && data.settings.modelUnitSystem ) {

			const unitSystem = data.settings.modelUnitSystem;
			const unitValue = ( unitSystem && typeof unitSystem === 'object' && 'value' in unitSystem )
				? unitSystem.value
				: unitSystem;

			if ( unitValue === 2 ) {

				scaleFactor = 0.001;

			} else if ( unitValue === 3 ) {

				scaleFactor = 0.01;

			}

		}

		object.scale.set( scaleFactor, scaleFactor, scaleFactor );

		const instanceDefinitionObjectIds = new Set();

		object.userData[ 'layers' ] = data.layers;
		object.userData[ 'groups' ] = data.groups;
		object.userData[ 'settings' ] = data.settings;
		object.userData.settings[ 'renderSettings' ] = data.renderSettings;
		object.userData[ 'objectType' ] = 'File3dm';
		object.userData[ 'materials' ] = null;

		object.name = this.url;

		let objects = data.objects;
		const materials = data.materials;

		const instanceDefMap = new Map();
		const objectMap = new Map();

		for ( let i = 0; i < objects.length; i ++ ) {

			const obj = objects[ i ];

			if ( obj.attributes && obj.attributes.id ) {
				objectMap.set( obj.attributes.id, obj );
			}

			if ( obj.objectType === 'InstanceDefinition' ) {
				instanceDefMap.set( obj.attributes.id, obj );
				if ( obj.attributes && Array.isArray( obj.attributes.objectIds ) ) {
					for ( let j = 0; j < obj.attributes.objectIds.length; j ++ ) {
						instanceDefinitionObjectIds.add( obj.attributes.objectIds[ j ] );
					}
				}
			}

		}

		const instanceDefCache = new Map();

		const processObject = ( obj, parentGroup ) => {

			if ( obj.objectType === 'InstanceDefinition' ) return;

			if ( obj.objectType === 'InstanceReference' ) {

				const defId = obj.geometry.parentIdefId;
				let cachedGroup = instanceDefCache.get( defId );

				if ( ! cachedGroup ) {

					const def = instanceDefMap.get( defId );
					if ( def ) {

						cachedGroup = new Group();
						const childIds = def.attributes.objectIds;
						if ( childIds ) {

							for ( let i = 0; i < childIds.length; i ++ ) {

								const childObj = objectMap.get( childIds[ i ] );
								if ( childObj ) {

									processObject( childObj, cachedGroup );

								}

							}

						}

						instanceDefCache.set( defId, cachedGroup );

					}

				}

				if ( cachedGroup ) {

					const instanceGroup = cachedGroup.clone( true );
					const xf = obj.geometry.xform.array;

					const matrix = new Matrix4();
					matrix.set( ...xf );

					instanceGroup.applyMatrix4( matrix );

					instanceGroup.userData.attributes = obj.attributes;

					parentGroup.add( instanceGroup );

				}

			} else {

				const isRenderableMeshObject = obj.objectType === 'Mesh' || obj.objectType === 'Extrusion' || obj.objectType === 'Brep';

				if ( ! isRenderableMeshObject ) return;

				const attributes = obj.attributes;
				let matId = null;
				const layer = data.layers[ attributes.layerIndex ];
				const matSource = attributes.materialSource ? attributes.materialSource.value : 0;

				switch ( matSource ) {

					case 0:
						if ( layer && layer.renderMaterialIndex >= 0 ) {

							matId = layer.renderMaterialIndex;

						}

						break;

					case 1:

						if ( attributes.materialIndex >= 0 ) {

							matId = attributes.materialIndex;

						}

						break;

				}

				let material = null;

				if ( matId >= 0 ) {
					const rMaterial = materials[ matId ];
					material = this._createMaterial( rMaterial, data.renderEnvironment );

				} 
				const _object = this._createObject( obj, material );

				if ( _object ) {

					_object.visible = layer ? layer.visible : true;
					parentGroup.add( _object );

				}

			}

		};

		for ( let i = 0; i < objects.length; i ++ ) {

			const obj = objects[ i ];
			
			if ( obj.objectType === 'InstanceDefinition' ) continue;

			const isDefinitionObject = obj.attributes && instanceDefinitionObjectIds.has( obj.attributes.id );
			if ( obj.attributes && ( obj.attributes.isInstanceDefinitionObject || isDefinitionObject ) ) continue;

			processObject( obj, object );

		}

		object.userData[ 'materials' ] = this.materials;
		object.name = '';
		return object;

	}

	_createObject( obj, mat ) {

		const loader = new BufferGeometryLoader();

		const attributes = obj.attributes;

		let geometry, material, _color, color;

		switch ( obj.objectType ) {

			case 'Mesh':
			case 'Extrusion':
			case 'Brep':

				if ( obj.geometry === null ) return;

				geometry = loader.parse( obj.geometry );

/*
				if ( mat === null ) {

					mat = this._createMaterial();

				}*/


				if ( ! mat ) {

					mat = this._createMaterial();

				}

				if ( geometry.hasAttribute( 'color' ) ) {

					mat.vertexColors = true;

				}

				mat = this._compareMaterials( mat );
				const mesh = new Mesh( geometry, mat );
				mesh.castShadow = attributes.castsShadows;
				mesh.receiveShadow = attributes.receivesShadows;

				mesh.userData[ 'attributes' ] = attributes;
				mesh.userData[ 'objectType' ] = obj.objectType;

				if ( attributes.name ) {

					mesh.name = attributes.name;

				}

				return mesh;
			case 'Light':

				geometry = obj.geometry;

				let light;

				switch ( geometry.lightStyle.name ) {

					case 'LightStyle_WorldPoint':

						light = new PointLight();
						light.castShadow = attributes.castsShadows;
						light.position.set( geometry.location[ 0 ], geometry.location[ 1 ], geometry.location[ 2 ] );
						light.shadow.normalBias = 0.1;

						break;

					case 'LightStyle_WorldSpot':

						light = new SpotLight();
						light.castShadow = attributes.castsShadows;
						light.position.set( geometry.location[ 0 ], geometry.location[ 1 ], geometry.location[ 2 ] );
						light.target.position.set( geometry.direction[ 0 ], geometry.direction[ 1 ], geometry.direction[ 2 ] );
						light.angle = geometry.spotAngleRadians;
						light.shadow.normalBias = 0.1;

						break;

					case 'LightStyle_WorldRectangular':

						light = new RectAreaLight();
						const width = Math.abs( geometry.width[ 2 ] );
						const height = Math.abs( geometry.length[ 0 ] );
						light.position.set( geometry.location[ 0 ] - ( height / 2 ), geometry.location[ 1 ], geometry.location[ 2 ] - ( width / 2 ) );
						light.height = height;
						light.width = width;
						light.lookAt( geometry.direction[ 0 ], geometry.direction[ 1 ], geometry.direction[ 2 ] );

						break;

					case 'LightStyle_WorldDirectional':

						light = new DirectionalLight();
						light.castShadow = attributes.castsShadows;
						light.position.set( geometry.location[ 0 ], geometry.location[ 1 ], geometry.location[ 2 ] );
						light.target.position.set( geometry.direction[ 0 ], geometry.direction[ 1 ], geometry.direction[ 2 ] );
						light.shadow.normalBias = 0.1;

						break;

					case 'LightStyle_WorldLinear':
						// no conversion exists, warning has already been printed to the console
						break;

					default:
						break;

				}

				if ( light ) {

					light.intensity = geometry.intensity;
					_color = geometry.diffuse;
					color = new Color( _color.r / 255.0, _color.g / 255.0, _color.b / 255.0 );
					light.color = color;
					light.userData[ 'attributes' ] = attributes;
					light.userData[ 'objectType' ] = obj.objectType;

				}

		}

	}

	_initLibrary() {

		if ( ! this.libraryPending ) {

			// Load rhino3dm wrapper.
			const jsLoader = new FileLoader( this.manager );
			jsLoader.setPath( this.libraryPath );
			const jsContent = new Promise( ( resolve, reject ) => {

				jsLoader.load( 'rhino3dm.js', resolve, undefined, reject );

			} );

			// Load rhino3dm WASM binary.
			const binaryLoader = new FileLoader( this.manager );
			binaryLoader.setPath( this.libraryPath );
			binaryLoader.setResponseType( 'arraybuffer' );
			const binaryContent = new Promise( ( resolve, reject ) => {

				binaryLoader.load( 'rhino3dm.wasm', resolve, undefined, reject );

			} );

			this.libraryPending = Promise.all( [ jsContent, binaryContent ] )
				.then( ( [ jsContent, binaryContent ] ) => {

					//this.libraryBinary = binaryContent;
					this.libraryConfig.wasmBinary = binaryContent;

					const fn = Rhino3dmWorker.toString();

					const body = [
						'/* rhino3dm.js */',
						jsContent,
						'/* worker */',
						fn.substring( fn.indexOf( '{' ) + 1, fn.lastIndexOf( '}' ) )
					].join( '\n' );

					this.workerSourceURL = URL.createObjectURL( new Blob( [ body ] ) );

				} );

		}

		return this.libraryPending;

	}

	_getWorker( taskCost ) {

		return this._initLibrary().then( () => {

			if ( this.workerPool.length < this.workerLimit ) {

				const worker = new Worker( this.workerSourceURL );

				worker._callbacks = {};
				worker._taskCosts = {};
				worker._taskLoad = 0;

				worker.postMessage( {
					type: 'init',
					libraryConfig: this.libraryConfig
				} );

				worker.onmessage = e => {

					const message = e.data;

					switch ( message.type ) {

						case 'warning':
							this.warnings.push( message.data );
							console.warn( message.data );
							break;

						case 'decode':
							worker._callbacks[ message.id ].resolve( message );
							break;

						case 'error':
							worker._callbacks[ message.id ].reject( message );
							break;

						default:
							console.error( 'THREE.HD3DMLoader: Unexpected message, "' + message.type + '"' );

					}

				};

				this.workerPool.push( worker );

			} else {

				this.workerPool.sort( function ( a, b ) {

					return a._taskLoad > b._taskLoad ? - 1 : 1;

				} );

			}

			const worker = this.workerPool[ this.workerPool.length - 1 ];

			worker._taskLoad += taskCost;

			return worker;

		} );

	}

	_releaseTask( worker, taskID ) {

		worker._taskLoad -= worker._taskCosts[ taskID ];
		delete worker._callbacks[ taskID ];
		delete worker._taskCosts[ taskID ];

	}

	/**
	 * Frees internal resources. This method should be called
	 * when the loader is no longer required.
	 */
	dispose() {

		for ( let i = 0; i < this.workerPool.length; ++ i ) {

			this.workerPool[ i ].terminate();

		}

		this.workerPool.length = 0;

		if ( this.objectUrls ) {
			this.objectUrls.forEach( url => URL.revokeObjectURL( url ) );
			this.objectUrls.length = 0;
		}

	}

}

/* WEB WORKER */

function Rhino3dmWorker() {

	let libraryPending;
	let libraryConfig;
	let rhino;
	let taskID;

	onmessage = function ( e ) {

		const message = e.data;

		switch ( message.type ) {

			case 'init':

				libraryConfig = message.libraryConfig;
				const wasmBinary = libraryConfig.wasmBinary;
				let RhinoModule;
				libraryPending = new Promise( function ( resolve ) {

					/* Like Basis Loader */
					RhinoModule = { wasmBinary, onRuntimeInitialized: resolve };

					rhino3dm( RhinoModule ); // eslint-disable-line no-undef

				 } ).then( () => {

					rhino = RhinoModule;

				 } );

				break;

			case 'decode':

				taskID = message.id;
				const buffer = message.buffer;
				libraryPending.then( () => {

					try {

						const data = decodeObjects( rhino, buffer );
						self.postMessage( { type: 'decode', id: message.id, data } );

					} catch ( error ) {

						self.postMessage( { type: 'error', id: message.id, error } );

					}

				} );

				break;

		}

	};

	function decodeObjects( rhino, buffer ) {

		const arr = new Uint8Array( buffer );
		const doc = rhino.File3dm.fromByteArray( arr );

		const objects = [];
		const materials = [];
		const layers = [];
		const views = [];
		const namedViews = [];
		const groups = [];
		const strings = [];

		//Handle objects

		const objs = doc.objects();
		const cnt = objs.count;

		for ( let i = 0; i < cnt; i ++ ) {

			const _object = objs.get( i );

			const object = extractObjectData( _object, doc );

			_object.delete();

			if ( object ) {

				objects.push( object );

			}

		}

		// Handle instance definitions
		// console.log( `Instance Definitions Count: ${doc.instanceDefinitions().count()}` );

		for ( let i = 0; i < doc.instanceDefinitions().count; i ++ ) {

			const idef = doc.instanceDefinitions().get( i );
			const idefAttributes = extractProperties( idef );
			idefAttributes.objectIds = idef.getObjectIds();

			objects.push( { geometry: null, attributes: idefAttributes, objectType: 'InstanceDefinition' } );

		}

		// Handle materials

		const textureTypes = [
			// rhino.TextureType.Bitmap,
			rhino.TextureType.Diffuse,
			rhino.TextureType.Bump,
			rhino.TextureType.Transparency,
			rhino.TextureType.Opacity,
			rhino.TextureType.Emap
		];

		const pbrTextureTypes = [
			rhino.TextureType.PBR_BaseColor,
			rhino.TextureType.PBR_Subsurface,
			rhino.TextureType.PBR_SubsurfaceScattering,
			rhino.TextureType.PBR_SubsurfaceScatteringRadius,
			rhino.TextureType.PBR_Metallic,
			rhino.TextureType.PBR_Specular,
			rhino.TextureType.PBR_SpecularTint,
			rhino.TextureType.PBR_Roughness,
			rhino.TextureType.PBR_Anisotropic,
			rhino.TextureType.PBR_Anisotropic_Rotation,
			rhino.TextureType.PBR_Sheen,
			rhino.TextureType.PBR_SheenTint,
			rhino.TextureType.PBR_Clearcoat,
			rhino.TextureType.PBR_ClearcoatBump,
			rhino.TextureType.PBR_ClearcoatRoughness,
			rhino.TextureType.PBR_OpacityIor,
			rhino.TextureType.PBR_OpacityRoughness,
			rhino.TextureType.PBR_Emission,
			rhino.TextureType.PBR_AmbientOcclusion,
			rhino.TextureType.PBR_Displacement
		];

		for ( let i = 0; i < doc.materials().count; i ++ ) {

			const _material = doc.materials().get( i );

			const material = extractProperties( _material );

			const textures = [];

			textures.push( ...extractTextures( _material, textureTypes, doc ) );

			material.pbrSupported = _material.physicallyBased().supported;

			if ( material.pbrSupported ) {

				textures.push( ...extractTextures( _material, pbrTextureTypes, doc ) );
				material.pbr = extractProperties( _material.physicallyBased() );

			}

			material.textures = textures;

			materials.push( material );

			_material.delete();

		}

		// Handle layers

		for ( let i = 0; i < doc.layers().count; i ++ ) {

			const _layer = doc.layers().get( i );
			const layer = extractProperties( _layer );

			layers.push( layer );

			_layer.delete();

		}

		// Handle views

		for ( let i = 0; i < doc.views().count; i ++ ) {

			const _view = doc.views().get( i );
			const view = extractProperties( _view );

			views.push( view );

			_view.delete();

		}

		// Handle named views

		for ( let i = 0; i < doc.namedViews().count; i ++ ) {

			const _namedView = doc.namedViews().get( i );
			const namedView = extractProperties( _namedView );

			namedViews.push( namedView );

			_namedView.delete();

		}

		// Handle groups

		for ( let i = 0; i < doc.groups().count; i ++ ) {

			const _group = doc.groups().get( i );
			const group = extractProperties( _group );

			groups.push( group );

			_group.delete();

		}

		// Handle settings

		const settings = extractProperties( doc.settings() );

		//TODO: Handle other document stuff like dimstyles, instance definitions, bitmaps etc.

		// Handle dimstyles
		// console.log( `Dimstyle Count: ${doc.dimstyles().count()}` );

		// Handle bitmaps
		// console.log( `Bitmap Count: ${doc.bitmaps().count()}` );

		// Handle strings
		// console.log( `Document Strings Count: ${doc.strings().count()}` );
		// Note: doc.strings().documentUserTextCount() counts any doc.strings defined in a section
		// console.log( `Document User Text Count: ${doc.strings().documentUserTextCount()}` );

		const strings_count = doc.strings().count;

		for ( let i = 0; i < strings_count; i ++ ) {

			strings.push( doc.strings().get( i ) );

		}

		// Handle Render Environments for Material Environment

		// get the id of the active render environment skylight, which we'll use for environment texture
		const reflectionId = doc.settings().renderSettings().renderEnvironments.reflectionId;

		const rc = doc.renderContent();

		let renderEnvironment = null;

		for ( let i = 0; i < rc.count; i ++ ) {

			const content = rc.get( i );

			switch ( content.kind ) {

				case 'environment':

					const id = content.id;

					// there could be multiple render environments in a 3dm file
					if ( id !== reflectionId ) break;

					const renderTexture = content.findChild( 'texture' );
					const fileName = renderTexture.fileName;

					for ( let j = 0; j < doc.embeddedFiles().count; j ++ ) {

						const _fileName = doc.embeddedFiles().get( j ).fileName;

						if ( fileName === _fileName ) {

							const background = doc.getEmbeddedFileAsBase64( fileName );
							const backgroundImage = 'data:image/png;base64,' + background;
							renderEnvironment = { type: 'renderEnvironment', image: backgroundImage, name: fileName };

						}

					}

					break;

			}

		}

		// Handle Render Settings

		const renderSettings = {
			ambientLight: doc.settings().renderSettings().ambientLight,
			backgroundColorTop: doc.settings().renderSettings().backgroundColorTop,
			backgroundColorBottom: doc.settings().renderSettings().backgroundColorBottom,
			useHiddenLights: doc.settings().renderSettings().useHiddenLights,
			depthCue: doc.settings().renderSettings().depthCue,
			flatShade: doc.settings().renderSettings().flatShade,
			renderBackFaces: doc.settings().renderSettings().renderBackFaces,
			renderPoints: doc.settings().renderSettings().renderPoints,
			renderCurves: doc.settings().renderSettings().renderCurves,
			renderIsoParams: doc.settings().renderSettings().renderIsoParams,
			renderMeshEdges: doc.settings().renderSettings().renderMeshEdges,
			renderAnnotations: doc.settings().renderSettings().renderAnnotations,
			useViewportSize: doc.settings().renderSettings().useViewportSize,
			scaleBackgroundToFit: doc.settings().renderSettings().scaleBackgroundToFit,
			transparentBackground: doc.settings().renderSettings().transparentBackground,
			imageDpi: doc.settings().renderSettings().imageDpi,
			shadowMapLevel: doc.settings().renderSettings().shadowMapLevel,
			namedView: doc.settings().renderSettings().namedView,
			snapShot: doc.settings().renderSettings().snapShot,
			specificViewport: doc.settings().renderSettings().specificViewport,
			groundPlane: extractProperties( doc.settings().renderSettings().groundPlane ),
			safeFrame: extractProperties( doc.settings().renderSettings().safeFrame ),
			dithering: extractProperties( doc.settings().renderSettings().dithering ),
			skylight: extractProperties( doc.settings().renderSettings().skylight ),
			linearWorkflow: extractProperties( doc.settings().renderSettings().linearWorkflow ),
			renderChannels: extractProperties( doc.settings().renderSettings().renderChannels ),
			sun: extractProperties( doc.settings().renderSettings().sun ),
			renderEnvironments: extractProperties( doc.settings().renderSettings().renderEnvironments ),
			postEffects: extractProperties( doc.settings().renderSettings().postEffects ),

		};

		doc.delete();

		return { objects, materials, layers, views, namedViews, groups, strings, settings, renderSettings, renderEnvironment };

	}

	function extractTextures( m, tTypes, d ) {

		const textures = [];

		for ( let i = 0; i < tTypes.length; i ++ ) {

			const _texture = m.getTexture( tTypes[ i ] );
			if ( _texture ) {

				let textureType = tTypes[ i ].constructor.name;
				textureType = textureType.substring( 12, textureType.length );
				const texture = extractTextureData( _texture, textureType, d );
				textures.push( texture );
				_texture.delete();

			}

		}

		return textures;

	}

	function extractTextureData( t, tType, d ) {

		const texture = { type: tType };

		let image = d.getEmbeddedFileAsBase64( t.fileName );

		if ( ! image ) {

			const shortName = t.fileName.split( /[\\/]/ ).pop();
			image = d.getEmbeddedFileAsBase64( shortName );

		}

		texture.wrapU = t.wrapU;
		texture.wrapV = t.wrapV;
		texture.wrapW = t.wrapW;

		if ( t.uvwTransform ) {

			const uvw = t.uvwTransform.toFloatArray( true );
			texture.repeat = [ uvw[ 0 ], uvw[ 5 ] ];
			texture.offset = [ uvw[ 12 ], uvw[ 13 ] ];

		}

		if ( image ) {

			const shortName = t.fileName.split( /[\\/]/ ).pop().toLowerCase();
			let mimeType = 'image/png';
			if ( shortName.endsWith( '.jpg' ) || shortName.endsWith( '.jpeg' ) ) {

				mimeType = 'image/jpeg';

			}

			texture.image = `data:${mimeType};base64,` + image;

		} else {
			
			// Use fileName instead of base64 if not embedded
			texture.image = t.fileName;

			self.postMessage( { type: 'warning', id: taskID, data: {
				message: `THREE.HD3DMLoader: Image for ${tType} texture not embedded in file. Using filename as URL.`,
				type: 'missing resource'
			}

			} );

		}
		return texture;

	}

	function extractObjectData( object, doc ) {

		const _geometry = object.geometry();
		const _attributes = object.attributes();
		let objectType = _geometry.objectType;
		let geometry, attributes, position, data, mesh;

		// skip instance definition objects
		//if( _attributes.isInstanceDefinitionObject ) { continue; }

		// TODO: handle other geometry types
		switch ( objectType ) {

			case rhino.ObjectType.Mesh:

				geometry = _geometry.toThreejsJSON();

				break;

			case rhino.ObjectType.Brep:

				mesh = null;
				let shouldDeleteMesh = false;

				try {
					if ( _geometry.getMeshes ) {

						let meshes = _geometry.getMeshes( rhino.MeshType.Render );

						if ( ! meshes || meshes.count === 0 ) {

							if ( meshes ) meshes.delete();
							meshes = _geometry.getMeshes( rhino.MeshType.Any );

						}

						if ( meshes && meshes.count > 0 ) {

							mesh = new rhino.Mesh();
							shouldDeleteMesh = true;

							for ( let i = 0; i < meshes.count; i ++ ) {

								const m = meshes.get( i );

								if ( m ) {

									mesh.append( m );
									m.delete();

								}

							}

							meshes.delete();

						} else {

							if ( meshes ) meshes.delete();

						}

					}

					if ( ! mesh || mesh.faces().count === 0 ) {

						if ( shouldDeleteMesh && mesh ) {

							mesh.delete();
							mesh = null;

						}

						const faces = _geometry.faces();

						if ( faces ) {

							mesh = new rhino.Mesh();
							shouldDeleteMesh = true;

							for ( let i = 0; i < faces.count; i ++ ) {

								const face = faces.get( i );

								if ( face ) {

									try {

										let faceMesh = face.getMesh( rhino.MeshType.Render );

										if ( ! faceMesh ) {

											faceMesh = face.getMesh( rhino.MeshType.Any );

										}

										if ( faceMesh ) {

											mesh.append( faceMesh );
											faceMesh.delete();

										}

									} catch ( e ) {

										// ignore face mesh extraction error

									} finally {

										face.delete();

									}

								}

							}

							faces.delete();

						}

					}

					if ( mesh && mesh.vertices().count > 0 && mesh.faces().count > 0 ) {

						mesh.compact();
						geometry = mesh.toThreejsJSON();

					}
				} catch ( e ) {
					// ignore
				} finally {
					if ( shouldDeleteMesh && mesh ) {
						mesh.delete();
					}
				}

				break;

			case rhino.ObjectType.Extrusion:

				try {
					mesh = _geometry.getMesh( rhino.MeshType.Render );

					if ( ! mesh ) {

						mesh = _geometry.getMesh( rhino.MeshType.Any );

					}

					if ( mesh ) {

						geometry = mesh.toThreejsJSON();
						mesh.delete();

					}
				} catch ( e ) {
					// ignore
				}

				break;

			case rhino.ObjectType.InstanceReference:

				geometry = extractProperties( _geometry );
				geometry.xform = extractProperties( _geometry.xform );
				geometry.xform.array = _geometry.xform.toFloatArray( true );

				break;

			case rhino.ObjectType.Curve:
			case rhino.ObjectType.Point:
			case rhino.ObjectType.PointSet:
			case rhino.ObjectType.TextDot:
			case rhino.ObjectType.Light:
			case rhino.ObjectType.SubD:
			case rhino.ObjectType.Annotation:
			case rhino.ObjectType.Hatch:
			case rhino.ObjectType.ClipPlane:
				// Skip explicitly to align with ModelManager
				break;

			default:

				self.postMessage( { type: 'warning', id: taskID, data: {
					message: `THREE.3DMLoader: Conversion not implemented for ${objectType.constructor.name}`,
					type: 'not implemented',
					guid: _attributes.id
				}

				} );

				break;

		}

		if ( geometry ) {

			attributes = extractProperties( _attributes );
			attributes.geometry = extractProperties( _geometry );

			if ( _attributes.groupCount > 0 ) {

				attributes.groupIds = _attributes.getGroupList();

			}

			if ( _attributes.userStringCount > 0 ) {

				attributes.userStrings = _attributes.getUserStrings();

			}

			if ( _geometry.userStringCount > 0 ) {

				attributes.geometry.userStrings = _geometry.getUserStrings();

			}

			if ( _attributes.decals().count > 0 ) {

				self.postMessage( { type: 'warning', id: taskID, data: {
					message: 'THREE.3DMLoader: No conversion exists for the decals associated with this object.',
					type: 'no conversion',
					guid: _attributes.id
				}

				} );

			}

			attributes.drawColor = _attributes.drawColor( doc );

			objectType = objectType.constructor.name;
			objectType = objectType.substring( 11, objectType.length );

			return { geometry, attributes, objectType };

		} else if ( objectType === rhino.ObjectType.Mesh || objectType === rhino.ObjectType.Extrusion || objectType === rhino.ObjectType.Brep ) {

			self.postMessage( { type: 'warning', id: taskID, data: {
				message: `THREE.3DMLoader: ${objectType.constructor.name} has no associated mesh geometry.`,
				type: 'missing mesh',
				guid: _attributes.id
			}

			} );

		}

	}

	function extractProperties( object ) {

		const result = {};

		for ( const property in object ) {

			const value = object[ property ];

			if ( typeof value !== 'function' ) {

				if ( typeof value === 'object' && value !== null && value.hasOwnProperty( 'constructor' ) ) {

					result[ property ] = { name: value.constructor.name, value: value.value };

				} else if ( typeof value === 'object' && value !== null ) {

					result[ property ] = extractProperties( value );

				} else {

					result[ property ] = value;

				}

			} else {

				// these are functions that could be called to extract more data.
				//console.log( `${property}: ${object[ property ].constructor.name}` );

			}

		}

		return result;

	}

}

export { HD3DMLoader };
