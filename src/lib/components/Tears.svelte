<script lang="ts">
	const reduceMotion =
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

	const drops = Array.from({ length: 30 }, (_, id) => ({
		id,
		left: Math.random() * 100,
		delay: -Math.random() * 4,
		duration: 2.6 + Math.random() * 2.4,
		scale: 0.55 + Math.random() * 0.85,
		drift: (Math.random() - 0.5) * 8
	}));
</script>

{#if reduceMotion}
	<div
		class="pointer-events-none fixed inset-0 z-40 flex items-start justify-center pt-20 text-6xl"
		aria-hidden="true"
	>
		😢
	</div>
{:else}
	<div class="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
		{#each drops as d (d.id)}
			<svg
				class="tear absolute top-0"
				width="18"
				height="26"
				viewBox="0 0 20 28"
				style:left="{d.left}%"
				style:animation-delay="{d.delay}s"
				style:animation-duration="{d.duration}s"
				style:--drift="{d.drift}vw"
				style:--scale={d.scale}
			>
				<path d="M10 0C10 0 1 12 1 19a9 9 0 0 0 18 0c0-7-9-19-9-19Z" fill="rgba(147,197,253,0.8)" />
				<ellipse cx="7" cy="16" rx="2.4" ry="4" fill="rgba(255,255,255,0.5)" />
			</svg>
		{/each}
	</div>
{/if}

<style>
	.tear {
		animation-name: fall;
		animation-timing-function: ease-in;
		animation-iteration-count: infinite;
		will-change: transform, opacity;
	}
	@keyframes fall {
		0% {
			transform: translateY(-10vh) translateX(0) scale(var(--scale, 1));
			opacity: 0;
		}
		10% {
			opacity: 0.9;
		}
		100% {
			transform: translateY(112vh) translateX(var(--drift, 0)) scale(var(--scale, 1));
			opacity: 0;
		}
	}
</style>
