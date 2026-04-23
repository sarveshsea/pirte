import {
  Camera,
  Geometry,
  Mesh,
  Orbit,
  Program,
  Raycast,
  Renderer,
  Sphere,
  Texture,
  Transform,
  Vec3,
  type OGLRenderingContext,
} from 'ogl'
import { rafLoop } from '../../lib/rafLoop'
import { LAND, LAND_H, LAND_W } from '../radio/landmass'
import { createStarField, computeCelestialState, MILKY_WAY_AXIS } from './celestial'
import {
  EARTH_RADIUS_UNITS,
  GROUND_DISTANCE,
  ORBIT_DISTANCE,
  REGION_DISTANCE,
} from './constants'
import {
  cartesianToLatLon,
  clamp,
  directionFromLocal,
  focusBasis,
  latLonToUnit,
  latLonToWorld,
  lerpVec3,
  normalizeVec3,
  scaleVec3,
  type Vec3Tuple,
} from './geo'
import type {
  CelestialState,
  ChunkMesh,
  ProjectedMarker,
  TerrainPatch,
  WaterMeshUpdate,
  WeatherSignals,
  WorldFocus,
  WorldSceneMode,
  WorldVisualMode,
} from './types'

type TerrainNode = {
  coord: string
  terrain: Mesh | null
  emissive: Mesh | null
  water: Mesh | null
}

type FlightState = {
  fromPos: Vec3Tuple
  toPos: Vec3Tuple
  fromTarget: Vec3Tuple
  toTarget: Vec3Tuple
  t: number
  duration: number
}

type TerrainMountResult = {
  mounted: number
  failed: number
}

const SKY_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 modelMatrix;
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform float uExposure;
uniform vec3 uMilkyAxis;
varying vec3 vDir;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 191.999))) * 43758.5453123);
}

void main() {
  float night = clamp(1.0 - max(dot(normalize(vDir), normalize(uSunDir)), 0.0) * 1.45, 0.0, 1.0);
  float zenith = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 base = mix(vec3(0.004, 0.006, 0.018), vec3(0.015, 0.024, 0.05), zenith);
  float band = pow(max(0.0, 1.0 - abs(dot(normalize(vDir), normalize(uMilkyAxis)))), 4.0);
  float gran = hash(normalize(vDir) * 420.0) * 0.6 + hash(normalize(vDir) * 1380.0) * 0.4;
  vec3 milky = vec3(0.09, 0.12, 0.17) * band * (0.32 + gran * 0.68);
  float dusk = pow(clamp(dot(normalize(vDir), normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0), 3.0);
  vec3 color = base + milky * night * uExposure;
  color += vec3(0.12, 0.07, 0.03) * dusk * 0.12;
  gl_FragColor = vec4(color, 1.0);
}
`

const STAR_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 color;
attribute float size;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float uFade;
varying vec3 vColor;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position * 78.0, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * (0.85 + uFade * 1.1);
  vColor = color;
  vFade = uFade;
}
`

const STAR_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vFade;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float alpha = (1.0 - d) * vFade;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`

const PLANET_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 modelMatrix;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const PLANET_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uLand;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
varying vec3 vWorldPos;
varying vec3 vNormal;

const float PI = 3.141592653589793;

void main() {
  vec3 n = normalize(vNormal);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  float land = texture2D(uLand, uv).r;
  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  float ndl = dot(n, sunDir);
  float daylight = smoothstep(-0.16, 0.12, ndl);
  float direct = max(ndl, 0.0);
  vec3 ocean = mix(vec3(0.012, 0.024, 0.05), vec3(0.05, 0.18, 0.34), daylight);
  vec3 landCol = mix(vec3(0.14, 0.19, 0.18), vec3(0.34, 0.48, 0.36), daylight);
  landCol += vec3(0.18, 0.10, 0.04) * smoothstep(0.62, 0.98, land);
  vec3 color = mix(ocean, landCol, smoothstep(0.18, 0.72, land));
  vec3 halfDir = normalize(sunDir + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), 52.0) * (1.0 - land) * daylight;
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  vec3 night = vec3(0.02, 0.03, 0.06) + vec3(0.03, 0.05, 0.10) * fresnel;
  color = mix(night, color, daylight);
  color += vec3(0.35, 0.52, 0.76) * spec;
  color += vec3(0.08, 0.16, 0.32) * fresnel * daylight * 0.4;
  gl_FragColor = vec4(color, 1.0);
}
`

const ATMOS_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 modelMatrix;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const ATMOS_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  vec3 sunDir = normalize(uSunDir);
  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.1);
  float sunSide = clamp(dot(normal, sunDir) * 0.5 + 0.5, 0.0, 1.0);
  vec3 rayleigh = vec3(0.24, 0.46, 1.0) * rim * (0.22 + sunSide * 0.68);
  vec3 mie = vec3(1.0, 0.44, 0.16) * rim * pow(1.0 - sunSide, 2.0) * 0.5;
  float alpha = rim * (0.16 + sunSide * 0.22);
  gl_FragColor = vec4(rayleigh + mie, alpha);
}
`

const TERRAIN_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec3 color;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 modelMatrix;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const TERRAIN_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
uniform float uVisual;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 s = normalize(uSunDir);
  vec3 v = normalize(uCameraPos - vWorldPos);
  float ndl = max(dot(n, s), 0.0);
  float halfLambert = ndl * 0.6 + 0.4;
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  vec3 color = vColor * (0.25 + halfLambert * 0.75);
  color += vec3(0.05, 0.08, 0.14) * fresnel * 0.35;
  color = mix(color * 0.82, color, uVisual);
  gl_FragColor = vec4(color, 1.0);
}
`

const EMISSIVE_FRAG = /* glsl */ `
precision highp float;
uniform float uStrength;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor * uStrength, 0.72 * uStrength);
}
`

const WATER_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 s = normalize(uSunDir);
  vec3 v = normalize(uCameraPos - vWorldPos);
  vec3 h = normalize(s + v);
  float ndl = max(dot(n, s), 0.0);
  float spec = pow(max(dot(n, h), 0.0), 88.0);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.2);
  vec3 color = vColor * (0.35 + ndl * 0.65) + vec3(0.22, 0.42, 0.78) * fresnel * 0.55;
  color += vec3(0.92, 0.98, 1.0) * spec * 0.52;
  gl_FragColor = vec4(color, 0.52 + fresnel * 0.16);
}
`

function landTextureCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = LAND_W
  canvas.height = LAND_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(LAND_W, LAND_H)
  for (let row = 0; row < LAND_H; row++) {
    for (let col = 0; col < LAND_W; col++) {
      const index = row * LAND_W + col
      const bit = (LAND[index >> 3] & (1 << (7 - (index & 7)))) !== 0 ? 255 : 0
      const offset = index * 4
      image.data[offset] = bit
      image.data[offset + 1] = bit
      image.data[offset + 2] = bit
      image.data[offset + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function easeOutQuart(t: number) {
  return 1 - Math.pow(1 - t, 4)
}

export class WorldRenderer {
  private renderer: Renderer
  private gl: OGLRenderingContext
  private camera: Camera
  private controls: Orbit
  private raycast = new Raycast()
  private scene = new Transform()
  private skyRoot = new Transform()
  private terrainRoot = new Transform()
  private skyMesh: Mesh
  private starsMesh: Mesh
  private planetMesh: Mesh
  private atmosphereMesh: Mesh
  private landTexture: Texture
  private skyProgram: Program
  private starProgram: Program
  private planetProgram: Program
  private atmosphereProgram: Program
  private terrainProgram: Program
  private emissiveProgram: Program
  private waterProgram: Program
  private terrainNodes = new Map<string, TerrainNode>()
  private stopLoop: (() => void) | null = null
  private width = 1
  private height = 1
  private mode: WorldSceneMode = 'orbit'
  private visualMode: WorldVisualMode = 'hybrid'
  private focus: WorldFocus | null = null
  private weather: WeatherSignals | null = null
  private patch: TerrainPatch | null = null
  private celestial: CelestialState = computeCelestialState(new Date())
  private flight: FlightState | null = null
  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, element: HTMLElement = canvas) {
    this.canvas = canvas
    this.renderer = new Renderer({
      canvas,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      alpha: false,
      antialias: true,
    })
    this.gl = this.renderer.gl as OGLRenderingContext
    this.gl.clearColor(0.008, 0.01, 0.018, 1)

    this.camera = new Camera(this.gl, { fov: 36, near: 0.01, far: 220 })
    this.camera.position.set(3.8, 1.7, ORBIT_DISTANCE)
    this.camera.lookAt([0, 0, 0])
    this.controls = new Orbit(this.camera, {
      element,
      target: new Vec3(0, 0, 0),
      enablePan: false,
      rotateSpeed: 0.18,
      zoomSpeed: 0.9,
      minDistance: 8.8,
      maxDistance: 18,
      ease: 0.14,
      inertia: 0.82,
      minPolarAngle: 0.08,
      maxPolarAngle: Math.PI - 0.08,
    })

    this.landTexture = new Texture(this.gl, {
      image: landTextureCanvas(),
      generateMipmaps: false,
      wrapS: this.gl.REPEAT,
      wrapT: this.gl.CLAMP_TO_EDGE,
    })

    this.skyProgram = new Program(this.gl, {
      vertex: SKY_VERT,
      fragment: SKY_FRAG,
      uniforms: {
        uSunDir: { value: this.celestial.sunDir },
        uExposure: { value: this.celestial.exposure },
        uMilkyAxis: { value: MILKY_WAY_AXIS },
      },
      cullFace: false,
      depthTest: false,
      depthWrite: false,
    })

    this.starProgram = new Program(this.gl, {
      vertex: STAR_VERT,
      fragment: STAR_FRAG,
      uniforms: {
        uFade: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    this.starProgram.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE)

    this.planetProgram = new Program(this.gl, {
      vertex: PLANET_VERT,
      fragment: PLANET_FRAG,
      uniforms: {
        uLand: { value: this.landTexture },
        uSunDir: { value: this.celestial.sunDir },
        uCameraPos: { value: [0, 0, 0] },
      },
    })

    this.atmosphereProgram = new Program(this.gl, {
      vertex: ATMOS_VERT,
      fragment: ATMOS_FRAG,
      uniforms: {
        uSunDir: { value: this.celestial.sunDir },
        uCameraPos: { value: [0, 0, 0] },
      },
      transparent: true,
      cullFace: false,
      depthWrite: false,
    })
    this.atmosphereProgram.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE)

    this.terrainProgram = new Program(this.gl, {
      vertex: TERRAIN_VERT,
      fragment: TERRAIN_FRAG,
      uniforms: {
        uSunDir: { value: this.celestial.sunDir },
        uCameraPos: { value: [0, 0, 0] },
        uVisual: { value: 1 },
      },
    })

    this.emissiveProgram = new Program(this.gl, {
      vertex: TERRAIN_VERT,
      fragment: EMISSIVE_FRAG,
      uniforms: {
        uStrength: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    })
    this.emissiveProgram.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE)

    this.waterProgram = new Program(this.gl, {
      vertex: TERRAIN_VERT,
      fragment: WATER_FRAG,
      uniforms: {
        uSunDir: { value: this.celestial.sunDir },
        uCameraPos: { value: [0, 0, 0] },
      },
      transparent: true,
      depthWrite: false,
    })

    this.scene.addChild(this.skyRoot)
    this.scene.addChild(this.terrainRoot)

    this.skyMesh = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: 86, widthSegments: 56, heightSegments: 28 }),
      program: this.skyProgram,
    })
    this.skyMesh.setParent(this.skyRoot)

    const stars = createStarField()
    this.starsMesh = new Mesh(this.gl, {
      geometry: new Geometry(this.gl, {
        position: { size: 3, data: stars.positions },
        color: { size: 3, data: stars.colors },
        size: { size: 1, data: stars.sizes },
      }),
      program: this.starProgram,
      mode: this.gl.POINTS,
    })
    this.starsMesh.setParent(this.skyRoot)

    this.planetMesh = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: EARTH_RADIUS_UNITS, widthSegments: 72, heightSegments: 40 }),
      program: this.planetProgram,
    })
    this.planetMesh.setParent(this.scene)

    this.atmosphereMesh = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: EARTH_RADIUS_UNITS + 0.18, widthSegments: 56, heightSegments: 28 }),
      program: this.atmosphereProgram,
    })
    this.atmosphereMesh.setParent(this.scene)

    this.stopLoop = rafLoop((t, dt) => this.frame(t, dt))
  }

  private updateScenePrograms() {
    const camPos = [this.camera.position.x, this.camera.position.y, this.camera.position.z]
    this.celestial = computeCelestialState(new Date())
    this.skyRoot.rotation.y = this.celestial.siderealAngle
    const weatherFade = 1 - clamp((this.weather?.weatherCode ?? 0) / 150, 0, 0.22)

    this.skyProgram.uniforms.uSunDir.value = this.celestial.sunDir
    this.skyProgram.uniforms.uExposure.value = this.celestial.exposure
    this.starProgram.uniforms.uFade.value = (this.mode === 'orbit' ? 1 : 0.6) * weatherFade
    this.planetProgram.uniforms.uSunDir.value = this.celestial.sunDir
    this.planetProgram.uniforms.uCameraPos.value = camPos
    this.atmosphereProgram.uniforms.uSunDir.value = this.celestial.sunDir
    this.atmosphereProgram.uniforms.uCameraPos.value = camPos
    this.terrainProgram.uniforms.uSunDir.value = this.celestial.sunDir
    this.terrainProgram.uniforms.uCameraPos.value = camPos
    this.terrainProgram.uniforms.uVisual.value = this.visualMode === 'ascii' ? 0.76 : 1
    this.emissiveProgram.uniforms.uStrength.value = this.visualMode === 'light' ? 1.05 : 0.72
    this.waterProgram.uniforms.uSunDir.value = this.celestial.sunDir
    this.waterProgram.uniforms.uCameraPos.value = camPos
  }

  private frame(_t: number, dt: number) {
    if (this.flight) {
      this.controls.enabled = false
      this.flight.t = Math.min(1, this.flight.t + dt / this.flight.duration)
      const eased = easeOutQuart(this.flight.t)
      const pos = lerpVec3(this.flight.fromPos, this.flight.toPos, eased)
      const target = lerpVec3(this.flight.fromTarget, this.flight.toTarget, eased)
      this.camera.position.set(pos[0], pos[1], pos[2])
      this.controls.target.set(target[0], target[1], target[2])
      this.camera.lookAt(this.controls.target)
      if (this.flight.t >= 1) {
        this.flight = null
        this.controls.forcePosition()
      }
    } else {
      this.controls.enabled = true
      this.controls.update()
    }

    this.camera.updateMatrixWorld()
    this.updateScenePrograms()
    this.renderer.render({ scene: this.scene, camera: this.camera })
  }

  private nodeKey(coord: ChunkMesh['coord']) {
    return `${coord.x}:${coord.y}:${coord.z}`
  }

  private validSurfaceBuffers(positions: Float32Array, normals: Float32Array, colors: Float32Array, indices: Uint16Array) {
    return (
      positions.length > 0 &&
      positions.length % 3 === 0 &&
      normals.length === positions.length &&
      colors.length === positions.length &&
      indices.length > 0 &&
      indices.length % 3 === 0
    )
  }

  private applyPatchMesh(mesh: ChunkMesh) {
    const key = this.nodeKey(mesh.coord)
    const previous = this.terrainNodes.get(key)
    previous?.terrain?.setParent(null)
    previous?.emissive?.setParent(null)
    previous?.water?.setParent(null)

    const basis = this.focus ? focusBasis(this.focus, EARTH_RADIUS_UNITS + 0.01) : null
    if (!basis) return false

    try {
      const terrainPositions = this.transformPositions(mesh.terrainPositions, basis)
      const terrainNormals = this.transformDirections(mesh.terrainNormals, basis)
      const emissivePositions = this.transformPositions(mesh.emissivePositions, basis)
      const emissiveNormals = this.transformDirections(mesh.emissiveNormals, basis)
      const waterPositions = this.transformPositions(mesh.waterPositions, basis)
      const waterNormals = this.transformDirections(mesh.waterNormals, basis)

      const terrain = this.validSurfaceBuffers(terrainPositions, terrainNormals, mesh.terrainColors, mesh.terrainIndices)
        ? new Mesh(this.gl, {
            geometry: new Geometry(this.gl, {
              position: { size: 3, data: terrainPositions },
              normal: { size: 3, data: terrainNormals },
              color: { size: 3, data: mesh.terrainColors },
              index: { data: mesh.terrainIndices },
            }),
            program: this.terrainProgram,
          })
        : null

      const emissive = this.validSurfaceBuffers(emissivePositions, emissiveNormals, mesh.emissiveColors, mesh.emissiveIndices)
        ? new Mesh(this.gl, {
            geometry: new Geometry(this.gl, {
              position: { size: 3, data: emissivePositions },
              normal: { size: 3, data: emissiveNormals },
              color: { size: 3, data: mesh.emissiveColors },
              index: { data: mesh.emissiveIndices },
            }),
            program: this.emissiveProgram,
          })
        : null

      const water = this.validSurfaceBuffers(waterPositions, waterNormals, mesh.waterColors, mesh.waterIndices)
        ? new Mesh(this.gl, {
            geometry: new Geometry(this.gl, {
              position: { size: 3, data: waterPositions },
              normal: { size: 3, data: waterNormals },
              color: { size: 3, data: mesh.waterColors },
              index: { data: mesh.waterIndices },
            }),
            program: this.waterProgram,
          })
        : null

      terrain?.setParent(this.terrainRoot)
      emissive?.setParent(this.terrainRoot)
      water?.setParent(this.terrainRoot)
      this.terrainNodes.set(key, { coord: key, terrain, emissive, water })
      return !!(terrain || emissive || water)
    } catch (error) {
      console.error('[pirte] terrain chunk mount failed', mesh.coord, error)
      this.terrainNodes.set(key, { coord: key, terrain: null, emissive: null, water: null })
      return false
    }
  }

  private transformPositions(data: Float32Array, basis: ReturnType<typeof focusBasis>) {
    const out = new Float32Array(data.length)
    for (let index = 0; index < data.length; index += 3) {
      const world = [
        basis.center[0] + basis.east[0] * data[index] + basis.up[0] * data[index + 1] + basis.north[0] * data[index + 2],
        basis.center[1] + basis.east[1] * data[index] + basis.up[1] * data[index + 1] + basis.north[1] * data[index + 2],
        basis.center[2] + basis.east[2] * data[index] + basis.up[2] * data[index + 1] + basis.north[2] * data[index + 2],
      ]
      out[index] = world[0]
      out[index + 1] = world[1]
      out[index + 2] = world[2]
    }
    return out
  }

  private transformDirections(data: Float32Array, basis: ReturnType<typeof focusBasis>) {
    const out = new Float32Array(data.length)
    for (let index = 0; index < data.length; index += 3) {
      const world = directionFromLocal(basis, [data[index], data[index + 1], data[index + 2]])
      out[index] = world[0]
      out[index + 1] = world[1]
      out[index + 2] = world[2]
    }
    return out
  }

  private focusAnchor() {
    if (!this.focus) return null
    const basis = focusBasis(this.focus, EARTH_RADIUS_UNITS + 0.01)
    return basis
  }

  private desiredView() {
    if (!this.focus || this.mode === 'orbit') {
      const unit = this.focus ? latLonToUnit(this.focus.lat, this.focus.lon) : normalizeVec3([0.32, 0.22, 1])
      const base = scaleVec3(unit, ORBIT_DISTANCE)
      return {
        target: [0, 0, 0] as Vec3Tuple,
        position: [base[0] + 1.4, base[1] + 0.9, base[2] + 1.2] as Vec3Tuple,
        minDistance: 8.8,
        maxDistance: 18,
      }
    }

    if (!this.patch) {
      const anchor = latLonToWorld(this.focus.lat, this.focus.lon, EARTH_RADIUS_UNITS)
      const unit = normalizeVec3(anchor)
      const position = [
        anchor[0] + unit[0] * 2.3 + 0.9,
        anchor[1] + unit[1] * 2.3 + 0.6,
        anchor[2] + unit[2] * 2.3 + 0.9,
      ] as Vec3Tuple
      return {
        target: [0, 0, 0] as Vec3Tuple,
        position,
        minDistance: 7.2,
        maxDistance: 16,
      }
    }

    const basis = this.focusAnchor()
    if (!basis) {
      return {
        target: [0, 0, 0] as Vec3Tuple,
        position: [2.4, 1.4, ORBIT_DISTANCE] as Vec3Tuple,
        minDistance: 8.8,
        maxDistance: 18,
      }
    }

    const distance = this.mode === 'ground' ? GROUND_DISTANCE : REGION_DISTANCE
    const target = basis.center
    const position = [
      target[0] + basis.up[0] * distance * 0.92 + basis.east[0] * distance * 0.66 + basis.north[0] * distance * 0.34,
      target[1] + basis.up[1] * distance * 0.92 + basis.east[1] * distance * 0.66 + basis.north[1] * distance * 0.34,
      target[2] + basis.up[2] * distance * 0.92 + basis.east[2] * distance * 0.66 + basis.north[2] * distance * 0.34,
    ] as Vec3Tuple
    return {
      target,
      position,
      minDistance: this.mode === 'ground' ? 0.12 : 0.22,
      maxDistance: this.mode === 'ground' ? 0.72 : 1.34,
    }
  }

  private syncFlight(force = false) {
    const next = this.desiredView()
    this.controls.minDistance = next.minDistance
    this.controls.maxDistance = next.maxDistance

    const fromPos: Vec3Tuple = [this.camera.position.x, this.camera.position.y, this.camera.position.z]
    const fromTarget: Vec3Tuple = [this.controls.target.x, this.controls.target.y, this.controls.target.z]
    if (force) {
      this.camera.position.set(next.position[0], next.position[1], next.position[2])
      this.controls.target.set(next.target[0], next.target[1], next.target[2])
      this.camera.lookAt(this.controls.target)
      this.controls.forcePosition()
      this.flight = null
      return
    }

    this.flight = {
      fromPos,
      toPos: next.position,
      fromTarget,
      toTarget: next.target,
      t: 0,
      duration: this.mode === 'ground' ? 0.9 : 1.25,
    }
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.renderer.setSize(width, height)
    this.camera.perspective({ aspect: width / Math.max(1, height) })
  }

  setSceneMode(mode: WorldSceneMode) {
    this.mode = mode
    this.syncFlight()
  }

  setVisualMode(mode: WorldVisualMode) {
    this.visualMode = mode
  }

  setFocus(focus: WorldFocus | null) {
    this.focus = focus
    this.syncFlight()
  }

  setWeather(weather: WeatherSignals | null) {
    this.weather = weather
  }

  setPatch(patch: TerrainPatch | null): TerrainMountResult {
    this.patch = patch
    for (const [, node] of this.terrainNodes) {
      node.terrain?.setParent(null)
      node.emissive?.setParent(null)
      node.water?.setParent(null)
    }
    this.terrainNodes.clear()
    if (!patch || !this.focus) return { mounted: 0, failed: 0 }
    let mounted = 0
    let failed = 0
    for (const mesh of patch.meshes) {
      if (this.applyPatchMesh(mesh)) mounted += 1
      else failed += 1
    }
    this.syncFlight()
    return { mounted, failed }
  }

  setWater(update: WaterMeshUpdate) {
    if (!this.patch || update.key !== this.patch.key || !this.focus) return
    const basis = focusBasis(this.focus, EARTH_RADIUS_UNITS + 0.01)
    for (const mesh of update.meshes) {
      const key = this.nodeKey(mesh.coord)
      const node = this.terrainNodes.get(key)
      node?.water?.setParent(null)
      try {
        const positions = this.transformPositions(mesh.waterPositions, basis)
        const normals = this.transformDirections(mesh.waterNormals, basis)
        const water = this.validSurfaceBuffers(positions, normals, mesh.waterColors, mesh.waterIndices)
          ? new Mesh(this.gl, {
              geometry: new Geometry(this.gl, {
                position: { size: 3, data: positions },
                normal: { size: 3, data: normals },
                color: { size: 3, data: mesh.waterColors },
                index: { data: mesh.waterIndices },
              }),
              program: this.waterProgram,
            })
          : null
        water?.setParent(this.terrainRoot)
        if (node) node.water = water
      } catch (error) {
        console.error('[pirte] water chunk mount failed', mesh.coord, error)
        if (node) node.water = null
      }
    }
  }

  pickGlobe(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1)
    this.camera.updateMatrixWorld()
    this.raycast.castMouse(this.camera, [x, y])

    const origin = [this.raycast.origin.x, this.raycast.origin.y, this.raycast.origin.z] as Vec3Tuple
    const direction = [this.raycast.direction.x, this.raycast.direction.y, this.raycast.direction.z] as Vec3Tuple
    const b = origin[0] * direction[0] + origin[1] * direction[1] + origin[2] * direction[2]
    const c = origin[0] * origin[0] + origin[1] * origin[1] + origin[2] * origin[2] - EARTH_RADIUS_UNITS ** 2
    const disc = b * b - c
    if (disc < 0) return null
    const t = -b - Math.sqrt(disc)
    if (t <= 0) return null
    const point: Vec3Tuple = [
      origin[0] + direction[0] * t,
      origin[1] + direction[1] * t,
      origin[2] + direction[2] * t,
    ]
    return cartesianToLatLon(point)
  }

  projectFocus(): ProjectedMarker | null {
    if (!this.focus) return null
    const world = latLonToWorld(this.focus.lat, this.focus.lon, EARTH_RADIUS_UNITS + 0.08)
    const view = new Vec3(world[0], world[1], world[2])
    this.camera.updateMatrixWorld()
    const cam = normalizeVec3([this.camera.position.x, this.camera.position.y, this.camera.position.z])
    const dir = normalizeVec3(world)
    if (dir[0] * cam[0] + dir[1] * cam[1] + dir[2] * cam[2] < 0.1) return null
    this.camera.project(view)
    if (view.z < -1 || view.z > 1) return null
    return {
      id: 'focus',
      x: (view.x * 0.5 + 0.5) * this.width,
      y: (1 - (view.y * 0.5 + 0.5)) * this.height,
      z: 1 - view.z,
      label: this.focus.label || 'focus',
    }
  }

  destroy() {
    this.stopLoop?.()
    this.controls.remove?.()
    for (const [, node] of this.terrainNodes) {
      node.terrain?.setParent(null)
      node.emissive?.setParent(null)
      node.water?.setParent(null)
    }
    this.terrainNodes.clear()
  }
}
