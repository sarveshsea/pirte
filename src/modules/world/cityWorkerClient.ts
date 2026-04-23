import WorldCityWorker from '../../workers/world-city.worker?worker'
import type { BrickPhase, VoxelBrick, VoxelBrickId } from './types'

type BuildBrickRequest = {
  type: 'buildBrick'
  id: number
  brick: VoxelBrickId
  phase: BrickPhase
}

type WorkerRequest = BuildBrickRequest

type WorkerResponse = {
  type: 'brickBuilt'
  id: number
  brick: VoxelBrick
}

export class WorldCityWorkerClient {
  private worker = new WorldCityWorker()
  private seq = 0
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const hit = this.pending.get(event.data.id)
      if (!hit) return
      this.pending.delete(event.data.id)
      hit.resolve(event.data.brick)
    }

    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'world city worker failed')
      for (const [, pending] of this.pending) pending.reject(error)
      this.pending.clear()
    }
  }

  private request<T>(message: WorkerRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(message.id, { resolve: resolve as (value: unknown) => void, reject })
      this.worker.postMessage(message)
    })
  }

  buildBrick(brick: VoxelBrickId, phase: BrickPhase) {
    const id = ++this.seq
    return this.request<VoxelBrick>({
      type: 'buildBrick',
      id,
      brick,
      phase,
    })
  }

  destroy() {
    this.worker.terminate()
    this.pending.clear()
  }
}
