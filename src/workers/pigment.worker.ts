/// <reference lib="webworker" />

import { generate, type PigmentParams } from '../modules/pigment/generate'

type RenderRequest = {
  id: number
  width: number
  height: number
  params: PigmentParams
}

type RenderResponse = {
  id: number
  width: number
  height: number
  buffer: ArrayBuffer
}

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, width, height, params } = event.data
  const image = {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  } as ImageData

  generate(image, params)

  const message: RenderResponse = {
    id,
    width,
    height,
    buffer: image.data.buffer,
  }

  workerScope.postMessage(message, [message.buffer])
}
