<script lang="ts">
	import { onMount } from 'svelte';
	import confetti from 'canvas-confetti';

	let canvas = $state<HTMLCanvasElement>();

	const reduceMotion =
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

	onMount(() => {
		if (reduceMotion || !canvas) return;

		const fire = confetti.create(canvas, { resize: true, useWorker: true });
		const rand = (a: number, b: number) => a + Math.random() * (b - a);

		const burst = (intensity: number) => {
			for (const side of [rand(0.08, 0.32), rand(0.68, 0.92)]) {
				fire({
					particleCount: Math.round(45 * intensity),
					startVelocity: 34,
					spread: 360,
					ticks: 80,
					gravity: 0.9,
					scalar: rand(0.8, 1.25),
					origin: { x: side, y: rand(0, 0.35) }
				});
			}
		};

		const started = Date.now();
		let timer: ReturnType<typeof setTimeout>;
		const loop = () => {
			const elapsed = Date.now() - started;
			burst(elapsed < 3500 ? 1 : 0.5);
			timer = setTimeout(loop, elapsed < 3500 ? 260 : 1100);
		};
		loop();

		return () => {
			clearTimeout(timer);
			fire.reset();
		};
	});
</script>

{#if reduceMotion}
	<div
		class="pointer-events-none fixed inset-0 z-40 flex items-start justify-center pt-20 text-6xl"
		aria-hidden="true"
	>
		🎆✨🎇
	</div>
{:else}
	<canvas
		bind:this={canvas}
		class="pointer-events-none fixed inset-0 z-40 h-full w-full"
		aria-hidden="true"
	></canvas>
{/if}
