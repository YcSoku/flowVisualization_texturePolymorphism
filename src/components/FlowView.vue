<template>
    <div id="stats"></div>
    <div id="playground">
    </div>

</template>
    
<script setup lang='ts'>
    import { onMounted } from 'vue';
    import { FlowFieldManager } from "./flowRenderElements/flowfield";
    import Stats from 'three/examples/jsm/libs/stats.module';
    import "mapbox-gl/dist/mapbox-gl.css";


    async function flowFieldVisualizing() {

        // Set FPS monitor
        let stats = new (Stats as any)();

        // Initialize the flow field manager
        const ffManager = await FlowFieldManager.Create("https://ycsoku.github.io/FFV_Database/json/flow_field_description.json", stats);
        if (ffManager.debug = false) {
            const container = document.getElementById('stats'); 
            container?.appendChild( stats.dom );
        }
    }

    onMounted(async()=> {
        await flowFieldVisualizing();

    });
</script>
    
<style>
#playground {
    height: 100%;
    width: 100%;
    margin: 0;
}

</style>