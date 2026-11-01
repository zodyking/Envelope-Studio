<template>
  <ClientOnly>
    <StudioApp />
    <template #fallback>
      <p class="boot">Opening Envelope Studio…</p>
    </template>
  </ClientOnly>
</template>
