"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Escenario 3D del hero: un micrófono monumental flotando en la niebla, rim
 * light rojo, polvo en suspensión y un piso de grilla que corre hacia el
 * horizonte. La cámara respira con el mouse.
 *
 * Sin assets externos: todo primitivas + materiales emisivos.
 */
export function HeroScene() {
	const mountRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const mount = mountRef.current;
		if (!mount) return;

		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x050507);
		scene.fog = new THREE.Fog(0x050507, 11, 30);

		const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
		camera.position.set(0, 1.0, 8.6);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.15;
		mount.appendChild(renderer.domElement);

		// ---- Luces: key fría arriba, rim rojo atrás, relleno mínimo ----
		scene.add(new THREE.AmbientLight(0xffffff, 0.45));

		const key = new THREE.SpotLight(0xfff4e0, 220, 40, Math.PI / 4.6, 0.55, 1.4);
		key.position.set(3, 8, 6);
		key.target.position.set(0, 1, 0);
		scene.add(key);
		scene.add(key.target);

		const front = new THREE.PointLight(0xf2ecdd, 30, 20, 2);
		front.position.set(0, 1.6, 5.5);
		scene.add(front);

		const rim = new THREE.PointLight(0xe8192c, 90, 26, 1.8);
		rim.position.set(-3.2, 2.4, -3.4);
		scene.add(rim);

		const rim2 = new THREE.PointLight(0xe8192c, 36, 18, 2);
		rim2.position.set(3.4, 0.6, -2.2);
		scene.add(rim2);

		// ---- Micrófono (grupo) ----
		const mic = new THREE.Group();

		const metal = new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 0.85, roughness: 0.3 });
		const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1c1c24, metalness: 0.8, roughness: 0.45 });

		// Cabeza: esfera + malla wireframe por encima (rejilla)
		const headCore = new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 24), metal);
		headCore.position.y = 1.9;
		mic.add(headCore);

		const grill = new THREE.Mesh(
			new THREE.SphereGeometry(1.08, 28, 20),
			new THREE.MeshStandardMaterial({
				color: 0x55555f,
				metalness: 0.9,
				roughness: 0.25,
				wireframe: true,
			}),
		);
		grill.position.y = 1.9;
		mic.add(grill);

		// Anillo rojo entre cabeza y cuerpo
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(0.62, 0.085, 16, 48),
			new THREE.MeshStandardMaterial({
				color: 0xe8192c,
				emissive: 0xe8192c,
				emissiveIntensity: 1.6,
				metalness: 0.4,
				roughness: 0.35,
			}),
		);
		ring.rotation.x = Math.PI / 2;
		ring.position.y = 0.82;
		mic.add(ring);

		// Cuerpo cónico
		const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.34, 2.5, 32), metal);
		body.position.y = -0.5;
		mic.add(body);

		const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.35, 32), darkMetal);
		base.position.y = -1.85;
		mic.add(base);

		mic.position.y = 0.45;
		mic.rotation.z = 0.16;
		mic.scale.setScalar(0.92);
		scene.add(mic);

		// ---- Piso: doble grilla corriendo hacia la cámara ----
		const gridA = new THREE.GridHelper(60, 60, 0xe8192c, 0x1a1a20);
		(gridA.material as THREE.Material).transparent = true;
		(gridA.material as THREE.Material).opacity = 0.42;
		gridA.position.y = -2.05;
		scene.add(gridA);

		const gridB = gridA.clone();
		gridB.position.z = -60;
		scene.add(gridB);

		// ---- Partículas: polvo/brasas ----
		const COUNT = 420;
		const positions = new Float32Array(COUNT * 3);
		const speeds = new Float32Array(COUNT);
		for (let i = 0; i < COUNT; i++) {
			positions[i * 3] = (Math.random() - 0.5) * 22;
			positions[i * 3 + 1] = Math.random() * 9 - 2;
			positions[i * 3 + 2] = (Math.random() - 0.5) * 16;
			speeds[i] = 0.12 + Math.random() * 0.5;
		}
		const dustGeo = new THREE.BufferGeometry();
		dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		const dust = new THREE.Points(
			dustGeo,
			new THREE.PointsMaterial({
				color: 0xe8606e,
				size: 0.035,
				transparent: true,
				opacity: 0.75,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			}),
		);
		scene.add(dust);

		// ---- Interacción ----
		let mx = 0;
		let my = 0;
		const onMouse = (e: MouseEvent) => {
			mx = e.clientX / window.innerWidth - 0.5;
			my = e.clientY / window.innerHeight - 0.5;
		};
		window.addEventListener("mousemove", onMouse, { passive: true });

		const resize = () => {
			const { clientWidth: w, clientHeight: h } = mount;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h, false);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(mount);

		// ---- Loop ----
		const start = performance.now();
		let raf = 0;
		const SPEED = 2.6;

		const render = () => {
			const t = (performance.now() - start) / 1000;

			if (!reduced) {
				mic.position.y = 0.6 + Math.sin(t * 0.9) * 0.16;
				mic.rotation.y = t * 0.24;
				mic.rotation.z = 0.16 + Math.sin(t * 0.5) * 0.045;
				ring.rotation.z = t * 0.6;

				// La grilla corre hacia la cámara en loop perfecto.
				const offset = (t * SPEED) % 60;
				gridA.position.z = offset;
				gridB.position.z = offset - 60;

				// Polvo subiendo
				const pos = dustGeo.getAttribute("position") as THREE.BufferAttribute;
				for (let i = 0; i < COUNT; i++) {
					let y = pos.getY(i) + speeds[i]! * 0.008;
					if (y > 7) y = -2;
					pos.setY(i, y);
				}
				pos.needsUpdate = true;

				// Pulso del rim light (latido)
				rim.intensity = 90 + Math.sin(t * 2.2) * 26;
			}

			// Cámara con parallax suave
			camera.position.x += (mx * 1.5 - camera.position.x) * 0.04;
			camera.position.y += (1.1 + my * -0.8 - camera.position.y) * 0.04;
			camera.lookAt(0, 0.7, 0);

			renderer.render(scene, camera);
			raf = requestAnimationFrame(render);
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			window.removeEventListener("mousemove", onMouse);
			renderer.dispose();
			scene.traverse((obj) => {
				if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
					obj.geometry.dispose();
					const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
					for (const m of mats) m.dispose();
				}
			});
			mount.removeChild(renderer.domElement);
		};
	}, []);

	return <div ref={mountRef} className="hero-scene" aria-hidden="true" />;
}
