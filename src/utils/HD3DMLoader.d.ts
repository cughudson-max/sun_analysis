import { Loader, LoadingManager, Object3D } from 'three';

export class HD3DMLoader extends Loader {
  constructor(manager?: LoadingManager);
  setLibraryPath(path: string): this;
  setWorkerLimit(workerLimit: number): this;
  load(
    url: string,
    onLoad: (object: Object3D) => void,
    onProgress?: (event: ProgressEvent<EventTarget>) => void,
    onError?: (error: unknown) => void
  ): void;
}
