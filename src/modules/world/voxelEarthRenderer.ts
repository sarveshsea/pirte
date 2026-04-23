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
  CITY_GROUND_DISTANCE,
  CITY_PREVIEW_DISTANCE,
  CITY_PRESENTATION_HORIZONTAL_SCALE,
  CITY_PRESENTATION_VERTICAL_SCALE,
  CITY_REGION_DISTANCE,
  CITY_SURFACE_LIFT,
  EARTH_RADIUS_UNITS,
  ORBIT_DISTANCE,
} from './constants'
import {
  cartesianToLatLon,
  clamp,
  mix,
  latLonToUnit,
  latLonToWorld,
  lerpVec3,
  normalizeVec3,
  scaleVec3,
  worldFromLocal,
  type Vec3Tuple,
} from './geo'
import { MANHATTAN_FOCUS, isManhattanFocus, manhattanLocalFromLatLon } from './manhattan'
import { buildWorldSystemFields, createSystemParticles, stepSystemParticles } from './systems'
import type {
  CelestialState,
  ProjectedMarker,
  VoxelBrick,
  WeatherSignals,
  WorldFocus,
  WorldLocationMarker,
  WorldSceneMode,
  WorldSystemFields,
  WorldVisualMode,
} from './types'

type BrickNode = {
  voxels: Mesh | null
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

const CITY_VOXEL_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec3 iOffset;
attribute vec3 iColor;
attribute float iAlpha;
attribute float iScale;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform vec3 uSunDir;
uniform float uVisual;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vLocal;
varying float vLight;
void main() {
  vec3 localPos = position * iScale;
  vec3 worldPos = localPos + iOffset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  vColor = iColor;
  vAlpha = iAlpha;
  vLocal = position * 2.0;
  float d = dot(normalize(normal), normalize(uSunDir));
  vLight = mix(0.58 + 0.42 * d, 0.86 + 0.14 * max(d, 0.0), uVisual);
}
`

const CITY_VOXEL_FRAG = /* glsl */ `
precision highp float;
uniform float uVisual;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vLocal;
varying float vLight;
void main() {
  vec3 a = abs(vLocal);
  float m = max(max(min(a.x, a.y), min(a.x, a.z)), min(a.y, a.z));
  float edge = smoothstep(0.86, 1.0, m);
  float inner = 1.0 - 0.35 * length(vLocal) / 1.732;
  vec3 col = vColor * vLight * inner;
  col = mix(col, vColor * 1.45 + vec3(0.08), edge * mix(0.48, 0.82, uVisual));
  float alpha = vAlpha * mix(0.82, 1.0, edge);
  gl_FragColor = vec4(col * alpha, alpha);
}
`

const CITY_WATER_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 iOffset;
attribute vec3 iColor;
attribute float iAlpha;
attribute float iScale;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vec3 world = vec3(
    iOffset.x + position.x * iScale,
    iOffset.y + sin(uTime * 0.7 + iOffset.x * 20.0 + iOffset.z * 14.0) * iScale * 0.04,
    iOffset.z + position.z * iScale
  );
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  vColor = iColor;
  vAlpha = iAlpha;
  vUv = position.xz + 0.5;
}
`

const CITY_WATER_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float edge = smoothstep(0.05, 0.35, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  float glow = 1.0 - edge;
  vec3 col = mix(vColor * 1.25, vColor * 0.65, glow);
  gl_FragColor = vec4(col * vAlpha, vAlpha * 0.95);
}
`

const PARTICLE_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 color;
attribute float alpha;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = 2.8 + alpha * 3.4;
  vColor = color;
  vAlpha = alpha;
}
`

const PARTICLE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float alpha = (1.0 - d) * vAlpha;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`

const FIELD_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 color;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
varying vec3 vColor;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vColor = color;
}
`

const FIELD_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 0.42);
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

function makeCubeGeometry() {
  const f = 0.5
  const positions = new Float32Array([
     f, -f, -f,   f,  f, -f,   f,  f,  f,   f, -f,  f,
    -f, -f,  f,  -f,  f,  f,  -f,  f, -f,  -f, -f, -f,
    -f,  f, -f,  -f,  f,  f,   f,  f,  f,   f,  f, -f,
    -f, -f,  f,  -f, -f, -f,   f, -f, -f,   f, -f,  f,
    -f, -f,  f,   f, -f,  f,   f,  f,  f,  -f,  f,  f,
     f, -f, -f,  -f, -f, -f,  -f,  f, -f,   f,  f, -f,
  ])
  const normals = new Float32Array([
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
   -1,0,0,-1,0,0,-1,0,0,-1,0,0,
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
    0,-1,0,0,-1,0,0,-1,0,0,-1,0,
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1,0,0,-1,0,0,-1,0,0,-1,
  ])
  const indices = new Uint16Array(36)
  for (let face = 0; face < 6; face++) {
    const base = face * 4
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], face * 6)
  }
  return { positions, normals, indices }
}

function makeWaterPlaneGeometry() {
  return {
    positions: new Float32Array([
      -0.5, 0, -0.5,
       0.5, 0, -0.5,
       0.5, 0,  0.5,
      -0.5, 0,  0.5,
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  }
}

function easeOutQuart(t: number) {
  return 1 - Math.pow(1 - t, 4)
}

function brickKey(id: VoxelBrick['id']) {
  return `${id.city}:${id.lod}:${id.x}:${id.y}:${id.z}`
}

export class VoxelEarthRenderer {
  private renderer: Renderer
  private gl: OGLRenderingContext
  private camera: Camera
  private controls: Orbit
  private raycast = new Raycast()
  private scene = new Transform()
  private skyRoot = new Transform()
  private cityRoot = new Transform()
  private skyMesh: Mesh
  private starsMesh: Mesh
  private planetMesh: Mesh
  private atmosphereMesh: Mesh
  private landTexture: Texture
  private skyProgram: Program
  private starProgram: Program
  private planetProgram: Program
  private atmosphereProgram: Program
  private cityVoxelProgram: Program
  private cityWaterProgram: Program
  private particleProgram: Program
  private fieldProgram: Program
  private particleMesh: Mesh
  private fieldMesh: Mesh
  private stopLoop: (() => void) | null = null
  private width = 1
  private height = 1
  private mode: WorldSceneMode = 'orbit'
  private visualMode: WorldVisualMode = 'hybrid'
  private focus: WorldFocus | null = null
  private weather: WeatherSignals | null = null
  private celestial: CelestialState = computeCelestialState(new Date())
  private flight: FlightState | null = null
  private brickNodes = new Map<string, BrickNode>()
  private debugFields = false
  private fields: WorldSystemFields | null = null
  private systemParticles = createSystemParticles(112)
  private lastFieldUpdate = 0
  private particlePositions = new Float32Array(this.systemParticles.length * 3)
  private particleColors = new Float32Array(this.systemParticles.length * 3)
  private particleAlpha = new Float32Array(this.systemParticles.length)
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

    this.cityVoxelProgram = new Program(this.gl, {
      vertex: CITY_VOXEL_VERT,
      fragment: CITY_VOXEL_FRAG,
      uniforms: {
        uSunDir: { value: this.celestial.sunDir },
        uVisual: { value: 1 },
      },
      transparent: true,
      cullFace: false,
      depthWrite: false,
    })
    this.cityVoxelProgram.setBlendFunc(this.gl.ONE, this.gl.ONE)

    this.cityWaterProgram = new Program(this.gl, {
      vertex: CITY_WATER_VERT,
      fragment: CITY_WATER_FRAG,
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      cullFace: false,
      depthWrite: false,
    })
    this.cityWaterProgram.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE)

    this.particleProgram = new Program(this.gl, {
      vertex: PARTICLE_VERT,
      fragment: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
    })
    this.particleProgram.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE)

    this.fieldProgram = new Program(this.gl, {
      vertex: FIELD_VERT,
      fragment: FIELD_FRAG,
      transparent: true,
      depthWrite: false,
    })
    this.fieldProgram.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE)

    this.scene.addChild(this.skyRoot)
    this.scene.addChild(this.cityRoot)

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

    this.particleMesh = new Mesh(this.gl, {
      geometry: new Geometry(this.gl, {
        position: { size: 3, data: this.particlePositions, usage: this.gl.DYNAMIC_DRAW },
        color: { size: 3, data: this.particleColors, usage: this.gl.DYNAMIC_DRAW },
        alpha: { size: 1, data: this.particleAlpha, usage: this.gl.DYNAMIC_DRAW },
      }),
      program: this.particleProgram,
      mode: this.gl.POINTS,
    })
    this.particleMesh.setParent(this.cityRoot)

    this.fieldMesh = new Mesh(this.gl, {
      geometry: new Geometry(this.gl, {
        position: { size: 3, data: new Float32Array(0) },
        color: { size: 3, data: new Float32Array(0) },
      }),
      program: this.fieldProgram,
      mode: this.gl.LINES,
    })
    this.fieldMesh.setParent(this.cityRoot)

    this.stopLoop = rafLoop((t, dt) => this.frame(t, dt))
  }

  private focusBasisForCity() {
    return {
      center: latLonToWorld(MANHATTAN_FOCUS.lat, MANHATTAN_FOCUS.lon, EARTH_RADIUS_UNITS + 0.01),
      ...(() => {
        const unit = normalizeVec3(latLonToWorld(MANHATTAN_FOCUS.lat, MANHATTAN_FOCUS.lon, 1))
        const lonR = (MANHATTAN_FOCUS.lon * Math.PI) / 180
        const latR = (MANHATTAN_FOCUS.lat * Math.PI) / 180
        const east = normalizeVec3([Math.cos(lonR), 0, -Math.sin(lonR)])
        const north = normalizeVec3([
          -Math.sin(latR) * Math.sin(lonR),
          Math.cos(latR),
          -Math.sin(latR) * Math.cos(lonR),
        ])
        return { east, north, up: unit }
      })(),
    }
  }

  private cityDataLocal(local: Vec3Tuple): Vec3Tuple {
    return [
      local[0] * CITY_PRESENTATION_HORIZONTAL_SCALE,
      CITY_SURFACE_LIFT + local[1] * CITY_PRESENTATION_VERTICAL_SCALE,
      local[2] * CITY_PRESENTATION_HORIZONTAL_SCALE,
    ]
  }

  private cityDataLocalToWorld(local: Vec3Tuple) {
    return worldFromLocal(this.focusBasisForCity(), this.cityDataLocal(local))
  }

  private updateScenePrograms(timeSec: number) {
    const camPos = [this.camera.position.x, this.camera.position.y, this.camera.position.z]
    this.celestial = computeCelestialState(new Date())
    this.skyRoot.rotation.y = this.celestial.siderealAngle
    const weatherFade = 1 - clamp((this.weather?.weatherCode ?? 0) / 150, 0, 0.22)
    const activeCity = Boolean(this.focus && isManhattanFocus(this.focus) && this.mode !== 'orbit')

    this.skyProgram.uniforms.uSunDir.value = this.celestial.sunDir
    this.skyProgram.uniforms.uExposure.value = this.celestial.exposure
    this.starProgram.uniforms.uFade.value = (this.mode === 'orbit' ? 1 : 0.7) * weatherFade
    this.planetProgram.uniforms.uSunDir.value = this.celestial.sunDir
    this.planetProgram.uniforms.uCameraPos.value = camPos
    this.atmosphereProgram.uniforms.uSunDir.value = this.celestial.sunDir
    this.atmosphereProgram.uniforms.uCameraPos.value = camPos
    this.cityVoxelProgram.uniforms.uSunDir.value = this.celestial.sunDir
    this.cityVoxelProgram.uniforms.uVisual.value = this.visualMode === 'ascii' ? 0.76 : this.visualMode === 'light' ? 1 : 0.92
    this.cityWaterProgram.uniforms.uTime.value = timeSec
    this.planetMesh.visible = !activeCity
    this.atmosphereMesh.visible = !activeCity
  }

  private updateParticles(dt: number, timeSec: number) {
    const activeCity = this.focus && isManhattanFocus(this.focus)
    this.particleMesh.visible = !!activeCity
    this.fieldMesh.visible = !!(activeCity && this.debugFields)
    if (!activeCity) return

    const basis = this.focusBasisForCity()
    stepSystemParticles(this.systemParticles, dt, timeSec, this.weather)
    for (let index = 0; index < this.systemParticles.length; index++) {
      const particle = this.systemParticles[index]
      const world = worldFromLocal(basis, [
        particle.x * 0.00022,
        CITY_SURFACE_LIFT + particle.y * 0.22,
        particle.z * 0.00018,
      ])
      const i3 = index * 3
      this.particlePositions[i3] = world[0]
      this.particlePositions[i3 + 1] = world[1]
      this.particlePositions[i3 + 2] = world[2]
      this.particleColors[i3] = 0.35
      this.particleColors[i3 + 1] = 0.76
      this.particleColors[i3 + 2] = 1
      this.particleAlpha[index] = 0.08 + ((index % 5) / 5) * 0.12
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posAttr = this.particleMesh.geometry.attributes.position as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colorAttr = this.particleMesh.geometry.attributes.color as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alphaAttr = this.particleMesh.geometry.attributes.alpha as any
    posAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    alphaAttr.needsUpdate = true
    this.particleMesh.geometry.updateAttribute(posAttr)
    this.particleMesh.geometry.updateAttribute(colorAttr)
    this.particleMesh.geometry.updateAttribute(alphaAttr)

    if (!this.debugFields || timeSec - this.lastFieldUpdate < 0.42) return
    this.lastFieldUpdate = timeSec
    this.fields = buildWorldSystemFields(12, 36, timeSec, this.weather)
    const positions: number[] = []
    const colors: number[] = []
    for (let row = 0; row < 36; row++) {
      for (let col = 0; col < 12; col++) {
        const localX = mix(-1.8, 1.8, col / 11)
        const localZ = mix(-8.5, 8.5, row / 35)
        const index = row * 12 + col
        const windX = this.fields.windField[index * 2] * 0.09
        const windZ = this.fields.windField[index * 2 + 1] * 0.09
        const turbulence = this.fields.turbulenceField[index]
        const start = worldFromLocal(basis, [localX, 0.06, localZ])
        const end = worldFromLocal(basis, [localX + windX, 0.06 + turbulence * 0.01, localZ + windZ])
        positions.push(start[0], start[1], start[2], end[0], end[1], end[2])
        const color: [number, number, number] = [0.2 + turbulence * 0.18, 0.55, 0.9]
        colors.push(...color, ...color)
      }
    }
    this.fieldMesh.geometry = new Geometry(this.gl, {
      position: { size: 3, data: new Float32Array(positions) },
      color: { size: 3, data: new Float32Array(colors) },
    })
  }

  private frame(t: number, dtMs: number) {
    const dt = dtMs / 1000
    const timeSec = t / 1000
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
    this.updateScenePrograms(timeSec)
    this.updateParticles(dt, timeSec)
    this.renderer.render({ scene: this.scene, camera: this.camera })
  }

  private worldOffsetsFromLocal(data: Float32Array) {
    const out = new Float32Array(data.length)
    for (let index = 0; index < data.length; index += 3) {
      const world = this.cityDataLocalToWorld([data[index], data[index + 1], data[index + 2]])
      out[index] = world[0]
      out[index + 1] = world[1]
      out[index + 2] = world[2]
    }
    return out
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

    if (isManhattanFocus(this.focus)) {
      const basis = this.focusBasisForCity()
      const local = manhattanLocalFromLatLon(this.focus.lat, this.focus.lon)
      const targetLocal = this.cityDataLocal([local.x, this.mode === 'ground' ? 0.00025 : 0.00042, local.z])
      const target = worldFromLocal(basis, targetLocal)
      if (this.brickNodes.size < 1) {
        const previewTarget = worldFromLocal(basis, this.cityDataLocal([local.x, 0, local.z]))
        return {
          target: previewTarget,
          position: [
            previewTarget[0] + basis.up[0] * CITY_PREVIEW_DISTANCE + basis.east[0] * 1.22 + basis.north[0] * 0.92,
            previewTarget[1] + basis.up[1] * CITY_PREVIEW_DISTANCE + basis.east[1] * 1.22 + basis.north[1] * 0.92,
            previewTarget[2] + basis.up[2] * CITY_PREVIEW_DISTANCE + basis.east[2] * 1.22 + basis.north[2] * 0.92,
          ] as Vec3Tuple,
          minDistance: 0.6,
          maxDistance: 4.2,
        }
      }
      const distance = this.mode === 'ground' ? CITY_GROUND_DISTANCE : CITY_REGION_DISTANCE
      return {
        target,
        position: [
          target[0] + basis.up[0] * distance * 0.62 + basis.east[0] * distance * 1.36 + basis.north[0] * distance * 0.82,
          target[1] + basis.up[1] * distance * 0.62 + basis.east[1] * distance * 1.36 + basis.north[1] * distance * 0.82,
          target[2] + basis.up[2] * distance * 0.62 + basis.east[2] * distance * 1.36 + basis.north[2] * distance * 0.82,
        ] as Vec3Tuple,
        minDistance: this.mode === 'ground' ? 0.16 : 0.42,
        maxDistance: this.mode === 'ground' ? 1.24 : 2.8,
      }
    }

    const anchor = latLonToWorld(this.focus.lat, this.focus.lon, EARTH_RADIUS_UNITS)
    const unit = normalizeVec3(anchor)
    return {
      target: [0, 0, 0] as Vec3Tuple,
      position: [
        anchor[0] + unit[0] * 2.2 + 0.9,
        anchor[1] + unit[1] * 2.2 + 0.6,
        anchor[2] + unit[2] * 2.2 + 0.9,
      ] as Vec3Tuple,
      minDistance: 7.2,
      maxDistance: 16,
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
      duration: this.mode === 'ground' ? 0.92 : 1.18,
    }
  }

  private makeVoxelMesh(brick: VoxelBrick) {
    if (brick.voxels.length < 3) return null
    const cube = makeCubeGeometry()
    const offsets = this.worldOffsetsFromLocal(brick.voxels)
    const count = brick.voxels.length / 3
    const scales = new Float32Array(count)
    scales.fill(brick.voxelScale * CITY_PRESENTATION_HORIZONTAL_SCALE)
    const geometry = new Geometry(this.gl, {
      position: { size: 3, data: cube.positions },
      normal: { size: 3, data: cube.normals },
      index: { data: cube.indices },
      iOffset: { size: 3, data: offsets, instanced: 1 },
      iColor: { size: 3, data: brick.materials, instanced: 1 },
      iAlpha: { size: 1, data: brick.lighting, instanced: 1 },
      iScale: { size: 1, data: scales, instanced: 1 },
    })
    geometry.instancedCount = count
    return new Mesh(this.gl, { geometry, program: this.cityVoxelProgram })
  }

  private makeWaterMesh(brick: VoxelBrick) {
    if (brick.water.length < 3) return null
    const plane = makeWaterPlaneGeometry()
    const offsets = this.worldOffsetsFromLocal(brick.water)
    const count = brick.water.length / 3
    const scales = new Float32Array(count)
    scales.fill(brick.voxelScale * CITY_PRESENTATION_HORIZONTAL_SCALE * 0.94)
    const geometry = new Geometry(this.gl, {
      position: { size: 3, data: plane.positions },
      index: { data: plane.indices },
      iOffset: { size: 3, data: offsets, instanced: 1 },
      iColor: { size: 3, data: brick.waterColors, instanced: 1 },
      iAlpha: { size: 1, data: brick.waterLighting, instanced: 1 },
      iScale: { size: 1, data: scales, instanced: 1 },
    })
    geometry.instancedCount = count
    return new Mesh(this.gl, { geometry, program: this.cityWaterProgram })
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

  setDebugFields(value: boolean) {
    this.debugFields = value
    this.fieldMesh.visible = value
  }

  clearBricks() {
    for (const [, node] of this.brickNodes) {
      node.voxels?.setParent(null)
      node.water?.setParent(null)
    }
    this.brickNodes.clear()
    this.syncFlight()
  }

  upsertBrick(brick: VoxelBrick) {
    const key = brickKey(brick.id)
    const prev = this.brickNodes.get(key)
    prev?.voxels?.setParent(null)
    prev?.water?.setParent(null)

    const voxels = this.makeVoxelMesh(brick)
    const water = this.makeWaterMesh(brick)
    voxels?.setParent(this.cityRoot)
    water?.setParent(this.cityRoot)
    this.brickNodes.set(key, { voxels, water })
    if (this.brickNodes.size === 1) this.syncFlight()
  }

  removeBricks(ids: VoxelBrick['id'][]) {
    for (const id of ids) {
      const key = brickKey(id)
      const node = this.brickNodes.get(key)
      node?.voxels?.setParent(null)
      node?.water?.setParent(null)
      this.brickNodes.delete(key)
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

  projectLocation(marker: WorldLocationMarker): ProjectedMarker | null {
    if (this.width < 2 || this.height < 2) return null
    const world = latLonToWorld(marker.lat, marker.lon, EARTH_RADIUS_UNITS + 0.08)
    const view = new Vec3(world[0], world[1], world[2])
    this.camera.updateMatrixWorld()
    const cam = normalizeVec3([this.camera.position.x, this.camera.position.y, this.camera.position.z])
    const dir = normalizeVec3(world)
    if (dir[0] * cam[0] + dir[1] * cam[1] + dir[2] * cam[2] < 0.08) return null
    this.camera.project(view)
    if (view.z < -1 || view.z > 1) return null
    return {
      id: marker.id,
      x: (view.x * 0.5 + 0.5) * this.width,
      y: (1 - (view.y * 0.5 + 0.5)) * this.height,
      z: 1 - view.z,
      label: marker.label,
      accent: marker.accent,
    }
  }

  projectFocus(): ProjectedMarker | null {
    if (!this.focus) return null
    return this.projectLocation({
      id: 'focus',
      lat: this.focus.lat,
      lon: this.focus.lon,
      label: this.focus.label || 'focus',
    })
  }

  destroy() {
    this.stopLoop?.()
    this.controls.remove?.()
    this.clearBricks()
  }
}
