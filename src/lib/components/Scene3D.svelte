<script lang="ts">
	import { scene as control } from '#lib/client/scene.svelte.ts';

	/*
	 * Background 3D field: a handful of large chrome, frosted-porcelain and graphite solids drifting
	 * slowly out of the dark. Materials stay neutral; only the rim light carries the accent. Three.js is loaded lazily after first
	 * paint; rendering pauses when the tab is hidden and freezes for reduced-motion users.
	 */

	let host = $state<HTMLDivElement | null>(null);
	let ready = $state(false);

	// Plain mirrors of the reactive control state, read inside the render loop.
	let mood = control.mood;
	let presence = control.presence;
	let lastPulse = control.pulses;
	let energy = 0;
	$effect(() => {
		mood = control.mood;
		presence = control.presence;
	});
	$effect(() => {
		if (control.pulses !== lastPulse) {
			lastPulse = control.pulses;
			energy = Math.min(3, energy + control.pulseStrength);
		}
	});

	// The scene only exists while some page wants it visible; hidden pages run no WebGL at all.
	const enabled = $derived(control.presence > 0);

	$effect(() => {
		if (!host || !enabled) return;
		const el = host;
		let disposed = false;
		let teardown = () => {};

		const start = async () => {
			const THREE = await import('three');
			const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
			const { RoundedBoxGeometry } = await import('three/examples/jsm/geometries/RoundedBoxGeometry.js');
			if (disposed) return;
			ready = false;

			let renderer: InstanceType<typeof THREE.WebGLRenderer>;
			try {
				renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
			} catch {
				return; // no WebGL: the CSS backdrop alone still looks good
			}
			const small = innerWidth < 760;
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
			renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.3 : 1.75));
			renderer.setSize(innerWidth, innerHeight);
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.toneMappingExposure = 0.95;
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			el.appendChild(renderer.domElement);

			const scene = new THREE.Scene();
			const pmrem = new THREE.PMREMGenerator(renderer);
			const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
			scene.environment = envTex;
			scene.fog = new THREE.Fog(0x08080a, 12, 44);

			const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 120);
			camera.position.set(0, 0, 12);

			// Soft studio key from above-left; a dim accent rim from below-right.
			const keyA = new THREE.DirectionalLight(0xffffff, 1.1);
			keyA.position.set(-6, 8, 6);
			const keyB = new THREE.PointLight(0xb9c3d3, 28, 40, 1.8);
			keyB.position.set(8, -5, 2);
			scene.add(keyA, keyB, new THREE.AmbientLight(0xffffff, 0.08));

			// Neutral, tactile materials: brushed chrome, frosted porcelain, graphite, and hairline edges.
			const lacquerA = new THREE.MeshPhysicalMaterial({ color: 0x9a9aa2, metalness: 0, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.9 });
			const lacquerB = new THREE.MeshPhysicalMaterial({ color: 0x2a2a30, metalness: 0.75, roughness: 0.32, envMapIntensity: 1.1 });
			const chrome = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd3, metalness: 1, roughness: 0.2, envMapIntensity: 1.2 });
			const wire = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 });

			const geometries = [
				new THREE.IcosahedronGeometry(1, 0),
				new THREE.OctahedronGeometry(1.05, 0),
				new THREE.TorusGeometry(0.8, 0.27, 28, 72),
				new THREE.TorusKnotGeometry(0.62, 0.2, 140, 18),
				new RoundedBoxGeometry(1.3, 1.3, 1.3, 4, 0.2),
				new THREE.SphereGeometry(0.85, 48, 32),
				new THREE.DodecahedronGeometry(0.95, 0),
				new THREE.CapsuleGeometry(0.45, 1, 8, 24)
			];
			const edges = [new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.4, 1)), new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.5, 0))];

			type Body = {
				obj: InstanceType<typeof THREE.Object3D>;
				spin: InstanceType<typeof THREE.Vector3>;
				speed: number;
				phase: number;
				baseScale: number;
			};
			const bodies: Body[] = [];
			const FAR = -48;
			const NEAR = 1;
			const rand = (a: number, b: number) => a + Math.random() * (b - a);

			// Keep a calm corridor in the middle of the screen so content stays readable.
			const place = (o: InstanceType<typeof THREE.Object3D>, z: number) => {
				const side = Math.random() < 0.5 ? -1 : 1;
				o.position.set(side * rand(3.2, 15), rand(-8, 8), z);
			};

			const count = small ? 6 : 12;
			for (let i = 0; i < count; i++) {
				let obj: InstanceType<typeof THREE.Object3D>;
				if (i % 6 === 5) {
					obj = new THREE.LineSegments(edges[i % edges.length], wire);
				} else {
					const mat = i % 3 === 0 ? chrome : i % 3 === 1 ? lacquerA : lacquerB;
					obj = new THREE.Mesh(geometries[i % geometries.length], mat);
				}
				const s = rand(0.8, 1.5);
				obj.scale.setScalar(s);
				obj.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
				place(obj, rand(FAR, NEAR - 2));
				scene.add(obj);
				bodies.push({ obj, spin: new THREE.Vector3(rand(-0.12, 0.12), rand(-0.16, 0.16), rand(-0.08, 0.08)), speed: rand(0.7, 1.2), phase: rand(0, 6.28), baseScale: s });
			}

			// Live accent colours (the CSS @property transition gives us a smooth interpolation for free).
			const target = { a: new THREE.Color(0xb9c3d3), b: new THREE.Color(0xe7eaf0), fog: new THREE.Color(0x08080a) };
			const readColors = () => {
				const cs = getComputedStyle(document.documentElement);
				const a = cs.getPropertyValue('--phos').trim();
				const b = cs.getPropertyValue('--phos-2').trim();
				const v = cs.getPropertyValue('--void').trim();
				if (a) target.a.setStyle(a, THREE.SRGBColorSpace);
				if (b) target.b.setStyle(b, THREE.SRGBColorSpace);
				if (v) target.fog.setStyle(v, THREE.SRGBColorSpace);
			};
			readColors();
			const colorTimer = setInterval(readColors, 250);

			const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
			const onPointer = (e: PointerEvent) => {
				pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
				pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
			};
			const onResize = () => {
				camera.aspect = innerWidth / innerHeight;
				camera.updateProjectionMatrix();
				renderer.setSize(innerWidth, innerHeight);
			};
			addEventListener('pointermove', onPointer, { passive: true });
			addEventListener('resize', onResize);

			const MOOD_SPEED = { calm: 0.32, live: 0.18, storm: 0.85, celebrate: 0.5 } as const;
			let speed = 1;
			let raf = 0;
			let last = performance.now();
			const fog = scene.fog as InstanceType<typeof THREE.Fog>;

			const frame = (now: number) => {
				raf = requestAnimationFrame(frame);
				const dt = Math.min(0.05, (now - last) / 1000);
				last = now;
				// Pages that hide the scene (presence 0) cost nothing: skip the GPU work entirely.
				if (presence <= 0) return;
				const t = now / 1000;

				energy = Math.max(0, energy - dt * 0.8);
				speed += (MOOD_SPEED[mood] - speed) * Math.min(1, dt * 0.8);
				const v = speed * (1 + energy * 0.9);

				const k = Math.min(1, dt * 2.5);
				keyB.color.lerp(target.a, k);
				fog.color.lerp(target.fog, k);

				for (const b of bodies) {
					const o = b.obj;
					o.position.z += v * b.speed * dt * 2.2;
					o.position.y += Math.sin(t * 0.35 + b.phase) * dt * 0.12;
					const spinBoost = 1 + energy * 1.2 + (mood === 'celebrate' ? 0.8 : 0);
					o.rotation.x += b.spin.x * dt * spinBoost;
					o.rotation.y += b.spin.y * dt * spinBoost;
					o.rotation.z += b.spin.z * dt * spinBoost;
					const breathe = 1 + energy * 0.03;
					o.scale.setScalar(b.baseScale * breathe);
					if (o.position.z > NEAR) place(o, FAR);
				}

				pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 1.2);
				pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 1.2);
				camera.position.x = pointer.x * 0.6;
				camera.position.y = -pointer.y * 0.4;
				camera.lookAt(0, 0, -12);
				keyB.position.y = -5 + Math.cos(t * 0.15) * 2;

				renderer.render(scene, camera);
			};

			const onVisibility = () => {
				cancelAnimationFrame(raf);
				if (document.visibilityState === 'visible' && !reduced) {
					last = performance.now();
					raf = requestAnimationFrame(frame);
				}
			};
			document.addEventListener('visibilitychange', onVisibility);

			if (reduced) renderer.render(scene, camera);
			else raf = requestAnimationFrame(frame);
			ready = true;

			teardown = () => {
				cancelAnimationFrame(raf);
				clearInterval(colorTimer);
				removeEventListener('pointermove', onPointer);
				removeEventListener('resize', onResize);
				document.removeEventListener('visibilitychange', onVisibility);
				for (const g of [...geometries, ...edges]) g.dispose();
				for (const m of [lacquerA, lacquerB, chrome, wire]) m.dispose();
				envTex.dispose();
				pmrem.dispose();
				renderer.dispose();
				renderer.domElement.remove();
			};
		};

		// Let the page paint first; the scene is decoration, never on the critical path.
		const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
		const handle = idle ? idle(() => void start()) : window.setTimeout(() => void start(), 200);
		return () => {
			disposed = true;
			if (!idle) clearTimeout(handle);
			teardown();
		};
	});
</script>

<!-- Fully hidden scenes leave the compositor entirely: an idle WebGL canvas that stays in the
     layer tree can hold new CSS animations in a pending state. -->
<div
	bind:this={host}
	class="scene"
	class:ready
	style:opacity={ready ? control.presence : 0}
	style:display={control.presence <= 0 ? 'none' : null}
	aria-hidden="true"
></div>

<style>
	.scene {
		position: fixed;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		transition: opacity 1.4s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.scene :global(canvas) {
		display: block;
		width: 100% !important;
		height: 100% !important;
	}
</style>
