<script lang="ts">
	/*
	 * Galaxy starfield — Svelte 5 port of the React Bits <Galaxy /> component (MIT, reactbits.dev).
	 * Renders a single full-screen triangle with a procedural star shader via `ogl`.
	 * Adaptations: pointer is tracked on the window (the canvas sits behind content), rendering
	 * pauses while the tab is hidden, reduced-motion users get a still frame, and the internal
	 * resolution adapts to the device so slow GPUs keep a smooth frame rate.
	 */
	import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';

	let {
		focal = [0.5, 0.5],
		rotation = [1.0, 0.0],
		starSpeed = 0.5,
		density = 1,
		hueShift = 140,
		disableAnimation = false,
		speed = 1.0,
		mouseInteraction = true,
		glowIntensity = 0.3,
		saturation = 0.0,
		mouseRepulsion = true,
		repulsionStrength = 2,
		twinkleIntensity = 0.3,
		rotationSpeed = 0.1,
		autoCenterRepulsion = 0,
		transparent = true,
		class: cls = ''
	}: {
		focal?: [number, number];
		rotation?: [number, number];
		starSpeed?: number;
		density?: number;
		hueShift?: number;
		disableAnimation?: boolean;
		speed?: number;
		mouseInteraction?: boolean;
		glowIntensity?: number;
		saturation?: number;
		mouseRepulsion?: boolean;
		repulsionStrength?: number;
		twinkleIntensity?: number;
		rotationSpeed?: number;
		autoCenterRepulsion?: number;
		transparent?: boolean;
		class?: string;
	} = $props();

	const vertex = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

	const fragment = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform bool uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform bool uTransparent;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) { return abs(fract(x) * 2.0 - 1.0); }

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);

      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;

      col += star * size * base;
    }
  }
  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;
  vec2 mouseNorm = uMouse - vec2(0.5);

  if (uAutoCenterRepulsion > 0.0) {
    float centerDist = length(uv);
    vec2 repulsion = normalize(uv) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  } else {
    uv += mouseNorm * 0.1 * uMouseActiveFactor;
  }

  float a = uTime * uRotationSpeed;
  uv = mat2(cos(a), -sin(a), sin(a), cos(a)) * uv;
  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);
  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uTransparent) {
    float alpha = smoothstep(0.0, 0.3, length(col));
    gl_FragColor = vec4(col, min(alpha, 1.0));
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`;

	let host = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!host) return;
		const ctn = host;
		// Snapshot props so the effect re-runs (rebuilds) only when one of them changes.
		const opts = {
			focal,
			rotation,
			starSpeed,
			density,
			hueShift,
			speed,
			glowIntensity,
			saturation,
			mouseRepulsion,
			repulsionStrength,
			twinkleIntensity,
			rotationSpeed,
			autoCenterRepulsion,
			transparent
		};
		const still = disableAnimation || matchMedia('(prefers-reduced-motion: reduce)').matches;
		const interactive = mouseInteraction;

		let renderer: Renderer;
		try {
			renderer = new Renderer({ alpha: opts.transparent, premultipliedAlpha: false, dpr: 1 });
		} catch {
			return; // no WebGL — the page background still stands on its own
		}
		const gl = renderer.gl;
		if (opts.transparent) {
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.clearColor(0, 0, 0, 0);
		} else {
			gl.clearColor(0, 0, 0, 1);
		}

		const program = new Program(gl, {
			vertex,
			fragment,
			uniforms: {
				uTime: { value: 0 },
				uResolution: { value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height) },
				uFocal: { value: new Float32Array(opts.focal) },
				uRotation: { value: new Float32Array(opts.rotation) },
				uStarSpeed: { value: opts.starSpeed },
				uDensity: { value: opts.density },
				uHueShift: { value: opts.hueShift },
				uSpeed: { value: opts.speed },
				uMouse: { value: new Float32Array([0.5, 0.5]) },
				uGlowIntensity: { value: opts.glowIntensity },
				uSaturation: { value: opts.saturation },
				uMouseRepulsion: { value: opts.mouseRepulsion },
				uTwinkleIntensity: { value: opts.twinkleIntensity },
				uRotationSpeed: { value: opts.rotationSpeed },
				uRepulsionStrength: { value: opts.repulsionStrength },
				uMouseActiveFactor: { value: 0 },
				uAutoCenterRepulsion: { value: opts.autoCenterRepulsion },
				uTransparent: { value: opts.transparent }
			}
		});
		const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

		// Internal resolution scale. Stars are point lights, so they stay crisp well below 1×.
		let scale = Math.min(devicePixelRatio, 1.25) * (innerWidth * innerHeight > 1_500_000 ? 0.75 : 1);
		const resize = () => {
			renderer.dpr = scale;
			renderer.setSize(ctn.offsetWidth, ctn.offsetHeight);
			program.uniforms.uResolution.value = new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
		};
		resize();
		addEventListener('resize', resize);
		gl.canvas.classList.add('block', 'h-full', 'w-full');
		ctn.appendChild(gl.canvas);

		const target = { x: 0.5, y: 0.5, active: 0 };
		const smooth = { x: 0.5, y: 0.5, active: 0 };
		const onMove = (e: PointerEvent) => {
			const r = ctn.getBoundingClientRect();
			target.x = (e.clientX - r.left) / r.width;
			target.y = 1 - (e.clientY - r.top) / r.height;
			target.active = 1;
		};
		const onLeave = () => (target.active = 0);
		if (interactive) {
			addEventListener('pointermove', onMove, { passive: true });
			document.documentElement.addEventListener('pointerleave', onLeave);
		}

		// Adaptive quality: if frames run long, step the resolution down (never below 0.35×).
		let slow = 0;
		let lastT = 0;
		const adapt = (t: number) => {
			const dt = lastT ? t - lastT : 16;
			lastT = t;
			slow = dt > 34 ? slow + 1 : Math.max(0, slow - 1);
			if (slow > 20 && scale > 0.35) {
				scale = Math.max(0.35, scale * 0.75);
				slow = 0;
				resize();
			}
		};

		let raf = 0;
		const frame = (t: number) => {
			raf = requestAnimationFrame(frame);
			adapt(t);
			if (!still) {
				program.uniforms.uTime.value = t * 0.001;
				program.uniforms.uStarSpeed.value = (t * 0.001 * opts.starSpeed) / 10;
			}
			smooth.x += (target.x - smooth.x) * 0.05;
			smooth.y += (target.y - smooth.y) * 0.05;
			smooth.active += (target.active - smooth.active) * 0.05;
			program.uniforms.uMouse.value[0] = smooth.x;
			program.uniforms.uMouse.value[1] = smooth.y;
			program.uniforms.uMouseActiveFactor.value = smooth.active;
			renderer.render({ scene: mesh });
		};
		const onVisibility = () => {
			cancelAnimationFrame(raf);
			if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
		};
		document.addEventListener('visibilitychange', onVisibility);
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			removeEventListener('resize', resize);
			removeEventListener('pointermove', onMove);
			document.documentElement.removeEventListener('pointerleave', onLeave);
			document.removeEventListener('visibilitychange', onVisibility);
			gl.canvas.remove();
			gl.getExtension('WEBGL_lose_context')?.loseContext();
		};
	});
</script>

<div bind:this={host} class="relative h-full w-full {cls}" aria-hidden="true"></div>
