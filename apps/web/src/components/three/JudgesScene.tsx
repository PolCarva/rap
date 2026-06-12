"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { JudgeVote } from "@rap/shared";

/**
 * Mesa de jurados en 3D: tres figuras low-poly (capucha + gorra) detrás del
 * estrado. En la etapa de votos cada jurado levanta el brazo señalando al
 * lado ganador (p1 = izquierda de pantalla, p2 = derecha); réplica = ambos
 * brazos en alto. Idle: respiración y balanceo sutil.
 */

interface Props {
	votes: JudgeVote[];
	/** "suspense" = brazos abajo, "votes"/"final" = votar (escalonado). */
	stage: "suspense" | "votes" | "final";
}

interface JudgeRig {
	group: THREE.Group;
	leftArm: THREE.Group;
	rightArm: THREE.Group;
	head: THREE.Group;
	/** Objetivos de rotación por etapa. */
	target: { left: number; right: number };
	delayMs: number;
	votedAt: number | null;
}

function buildArm(material: THREE.Material, side: 1 | -1): THREE.Group {
	const arm = new THREE.Group();
	// Brazo colgando: capsula a lo largo de -Y desde el hombro.
	const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.52, 6, 12), material);
	upper.position.y = -0.33;
	arm.add(upper);
	// Mano: esfera + dedo índice (señalando).
	const hand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), material);
	hand.position.y = -0.68;
	arm.add(hand);
	const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.16, 4, 8), material);
	finger.position.set(side * 0.02, -0.82, 0);
	arm.add(finger);
	return arm;
}

function buildJudge(accent: THREE.Material): JudgeRig {
	// Materiales más claros que el fondo: el rim rojo + key cenital los recortan.
	const hoodie = new THREE.MeshStandardMaterial({ color: 0x3c3c49, roughness: 0.75, metalness: 0.1 });
	const skin = new THREE.MeshStandardMaterial({ color: 0x9a7a5d, roughness: 0.65, metalness: 0 });
	const capMat = new THREE.MeshStandardMaterial({ color: 0x86101e, roughness: 0.55, metalness: 0.1 });

	const group = new THREE.Group();

	// Torso con capucha (cono truncado) + hombros redondeados.
	const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 1.05, 18), hoodie);
	torso.position.y = -0.62;
	group.add(torso);
	const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hoodie);
	shoulders.position.y = -0.18;
	shoulders.scale.set(1.25, 0.7, 1);
	group.add(shoulders);

	// Cabeza: cráneo visible + gorra plana (snapback) con visera larga al frente.
	const head = new THREE.Group();
	const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 14), skin);
	head.add(skull);
	// Corona de la gorra: casquete chato y levemente inclinado hacia atrás,
	// dejando ver frente y orejas (que no parezca casco).
	const crown = new THREE.Mesh(new THREE.SphereGeometry(0.265, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), capMat);
	crown.position.y = 0.09;
	crown.scale.set(1.05, 0.82, 1.05);
	crown.rotation.x = -0.08;
	head.add(crown);
	// Visera: disco elíptico fino proyectado hacia adelante, caída hacia abajo.
	const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 18), capMat);
	brim.scale.set(1, 1, 1.55);
	brim.position.set(0, 0.13, 0.3);
	brim.rotation.x = -0.14;
	head.add(brim);
	// Botón superior rojo (detalle snapback).
	const button = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), accent);
	button.position.y = 0.3;
	head.add(button);
	head.position.y = 0.22;
	group.add(head);

	// Brazos con pivote en el hombro.
	const leftArm = buildArm(hoodie, -1);
	leftArm.position.set(-0.46, -0.2, 0.05);
	group.add(leftArm);
	const rightArm = buildArm(hoodie, 1);
	rightArm.position.set(0.46, -0.2, 0.05);
	group.add(rightArm);

	return { group, leftArm, rightArm, head, target: { left: 0, right: 0 }, delayMs: 0, votedAt: null };
}

export function JudgesScene({ votes, stage }: Props) {
	const mountRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef(stage);

	useEffect(() => {
		stageRef.current = stage;
	}, [stage]);

	useEffect(() => {
		const mount = mountRef.current;
		if (!mount) return;

		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		const scene = new THREE.Scene();
		scene.fog = new THREE.Fog(0x050507, 9, 18);

		const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
		camera.position.set(0, 0.3, 5.3);
		camera.lookAt(0, -0.25, 0);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000000, 0);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.2;
		mount.appendChild(renderer.domElement);

		// Luces: key fría cenital + rims rojos laterales (lenguaje de la arena).
		scene.add(new THREE.AmbientLight(0xffffff, 0.68));
		const key = new THREE.SpotLight(0xfff2dc, 200, 30, Math.PI / 4, 0.6, 1.5);
		key.position.set(0, 6, 5);
		scene.add(key);
		const rimL = new THREE.PointLight(0xe8192c, 55, 16, 1.7);
		rimL.position.set(-4.2, 1.4, -1.8);
		scene.add(rimL);
		const rimR = new THREE.PointLight(0xe8192c, 55, 16, 1.7);
		rimR.position.set(4.2, 1.4, -1.8);
		scene.add(rimR);

		const accent = new THREE.MeshStandardMaterial({
			color: 0xe8192c,
			emissive: 0xe8192c,
			emissiveIntensity: 1.1,
			roughness: 0.4,
		});

		// Estrado: mesa oscura con filo rojo emisivo.
		const desk = new THREE.Mesh(
			new THREE.BoxGeometry(6.4, 0.85, 0.9),
			new THREE.MeshStandardMaterial({ color: 0x101015, roughness: 0.5, metalness: 0.35 }),
		);
		desk.position.set(0, -1.45, 0.55);
		scene.add(desk);
		const deskEdge = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.045, 0.04), accent);
		deskEdge.position.set(0, -1.02, 1.0);
		scene.add(deskEdge);

		// Tres jurados.
		const rigs: JudgeRig[] = [];
		for (let i = 0; i < 3; i++) {
			const rig = buildJudge(accent);
			rig.group.position.set((i - 1) * 1.85, -0.15, 0);
			rig.delayMs = i * 380;
			scene.add(rig.group);
			rigs.push(rig);
		}

		// Rotaciones objetivo según el voto. Brazo colgando = -Y; rotación Z
		// negativa lo abre hacia la izquierda de pantalla, positiva a la derecha.
		const POINT = 2.35; // ~135°: brazo en alto señalando al costado
		const applyVotes = () => {
			rigs.forEach((rig, i) => {
				const vote = votes[i]?.vote;
				if (vote === "p1") rig.target = { left: -POINT, right: 0 };
				else if (vote === "p2") rig.target = { left: 0, right: POINT };
				else rig.target = { left: -2.9, right: 2.9 }; // réplica: ambos brazos arriba
			});
		};
		applyVotes();

		const resize = () => {
			const { clientWidth: w, clientHeight: h } = mount;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h, false);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(mount);

		const start = performance.now();
		let votingSince: number | null = null;
		let raf = 0;

		const render = () => {
			const now = performance.now();
			const t = (now - start) / 1000;
			const voting = stageRef.current !== "suspense";
			if (voting && votingSince === null) votingSince = now;
			if (!voting) votingSince = null;

			for (let i = 0; i < rigs.length; i++) {
				const rig = rigs[i]!;
				// Idle: respiración + balanceo de cabeza.
				if (!reduced) {
					rig.group.position.y = -0.15 + Math.sin(t * 1.3 + i * 1.7) * 0.025;
					rig.head.rotation.z = Math.sin(t * 0.7 + i * 2.1) * 0.06;
					rig.head.rotation.y = Math.sin(t * 0.5 + i * 1.3) * 0.12;
				}

				// Voto: el brazo sube con easing una vez pasado el delay del jurado.
				const active = voting && votingSince !== null && now - votingSince > rig.delayMs;
				const targetL = active ? rig.target.left : 0;
				const targetR = active ? rig.target.right : 0;
				const ease = reduced ? 1 : 0.085;
				rig.leftArm.rotation.z += (targetL - rig.leftArm.rotation.z) * ease;
				rig.rightArm.rotation.z += (targetR - rig.rightArm.rotation.z) * ease;
				// Pequeño empuje hacia adelante al señalar.
				const lift = Math.max(Math.abs(rig.leftArm.rotation.z), Math.abs(rig.rightArm.rotation.z)) / POINT;
				rig.group.rotation.x = -lift * 0.07;
			}

			renderer.render(scene, camera);
			raf = requestAnimationFrame(render);
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			renderer.dispose();
			scene.traverse((obj) => {
				if (obj instanceof THREE.Mesh) {
					obj.geometry.dispose();
					const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
					for (const m of mats) m.dispose();
				}
			});
			mount.removeChild(renderer.domElement);
		};
		// votes es estable por batalla (se monta una vez por veredicto).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [votes]);

	return <div ref={mountRef} className="judges-scene" aria-hidden="true" />;
}
