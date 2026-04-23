import WorldWorker from '../../workers/world.worker?worker'
import type {
  TerrainPatch,
  TerrainSample,
  WaterDisturbance,
  WaterMeshUpdate,
  WeatherSignals,
} from './types'

type BuildPatchRequest = {
  type: 'buildPatch'
  id: number
  sample: TerrainSample
  weather: WeatherSignals | null
}

type StepWaterRequest = {
  type: 'stepWater'
  id: number
  key: string
  weather: WeatherSignals | null
  disturbance?: WaterDisturbance
}

type DisposePatchRequest = {
  type: 'disposePatch'
  key: string
}

type WorkerRequest = BuildPatchRequest | StepWaterRequest | DisposePatchRequest

type BuildPatchResponse = {
  type: 'patchBuilt'
  id: number
  patch: TerrainPatch
}

type StepWaterResponse = {
  type: 'waterStepped'
  id: number
  update: WaterMeshUpdate
}

type WorkerResponse = BuildPatchResponse | StepWaterResponse

export class WorldPatchWorkerClient {
  private worker = new WorldWorker()
  private seq = 0
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      const hit = this.pending.get(message.id)
      if (!hit) return
      this.pending.delete(message.id)
      if (message.type === 'patchBuilt') {
        hit.resolve(message.patch)
        return
      }
      hit.resolve(message.update)
    }

    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'world worker failed')
      for (const [, pending] of this.pending) pending.reject(error)
      this.pending.clear()
    }
  }

  private request<T>(message: WorkerRequest): Promise<T> {
    if (message.type === 'disposePatch') {
      this.worker.postMessage(message)
      return Promise.resolve(undefined as T)
    }

    return new Promise<T>((resolve, reject) => {
      this.pending.set(message.id, { resolve: resolve as (value: unknown) => void, reject })
      this.worker.postMessage(message)
    })
  }

  buildPatch(sample: TerrainSample, weather: WeatherSignals | null) {
    const id = ++this.seq
    return this.request<TerrainPatch>({
      type: 'buildPatch',
      id,
      sample,
      weather,
    })
  }

  stepWater(key: string, weather: WeatherSignals | null, disturbance?: WaterDisturbance) {
    const id = ++this.seq
    return this.request<WaterMeshUpdate>({
      type: 'stepWater',
      id,
      key,
      weather,
      disturbance,
    })
  }

  disposePatch(key: string) {
    return this.request<void>({
      type: 'disposePatch',
      key,
    })
  }

  destroy() {
    this.worker.terminate()
    this.pending.clear()
  }
}
