export const PROJECTS = [
        { key: 'profile', name: 'Profile', isProfile: true, collections: [] },
        {
            key: 'naivaa', name: 'Naivaa',
            collections: [
                { name: 'Summer Land', base: 'assets/projects/naivaa/collections/summer-land/gallery/', items: [
                    ['summerland3.webp', 'Graphic tees designed with graphics inspired by the groove culture in Nairobi.'],
                    ['summerland2.webp', 'Premium 230gsm cotton tees.'],
                    ['summerland-description.webp', 'A playful take on summer streetwear.']
                ]},
                { name: 'Chokoleti', base: 'assets/projects/naivaa/collections/chokoleti/gallery/', items: [
                    ['chokoleti-hero.jpg', 'Chokoleti celebrates comfort in your own skin.'],
                    ['models.jpg', 'Designed to complement melanated skin, with warm neutrals that feel familiar.'],
                    ['hoodie.jpg', 'Soft textures and relaxed forms make comfort the centre of the collection.'],
                    ['mocha.jpg', 'Mocha, beige, and earthy browns create a palette grounded in warmth.'],
                    ['Chokoleti2.webp', 'Promoting skin and body positivity through the clothes.']
                ]},
                { name: 'Slidr', base: 'assets/projects/naivaa/collections/slidr/gallery/', items: [
                    ['black-slides.jpg', 'Black Naivaa Slides.'],
                    ['white-slides.jpg', 'White Naivaa Slides.'],
                    ['slides.jpg', 'A minimal footwear collection built around everyday versatility.'],
                    ['white-slides2.jpg', 'Artwork inspired by the Slidr collection.'],
                    ['slidr.webp', 'An artistic exploration of the Slidr collection.']
                ]},
                { name: 'Nairobi Bags', base: 'assets/projects/naivaa/collections/nairobi-bags/gallery/', items: [
                    ['bags.jpg', 'A collaboration with internationally acclaimed illustrator Brian Omolo, combining Ghanaian Kente with locally sourced Grade A leather.']
                ]}
            ]
        },
        {
            key: 'digital-art', name: 'Digital Art',
            collections: [{ name: 'Gallery', base: 'assets/projects/digital-art/gallery/', items: [
                ['dreamers-residency.webp', 'Dreamers Residency'], ['hair.png', 'Hair'], ['creator.png', 'Creator'],
                ['corteiz.png', 'Corteiz'], ['bizaar.webp', 'Bizaar'], ['self.png', 'Self'], ['mirror.png', 'Mirror'],
                ['facade.webp', 'Facade'], ['surreal.webp', 'Surreal'], ['hurricane.webp', 'Hurricane']
            ]}]
        },
        {
            key: 'graphic-design', name: 'Graphic Design',
            collections: [
                { name: 'Posters', base: 'assets/projects/graphic-design/collections/posters/', items: [
                    ['amka.webp', 'Event poster design for a literature forum.'],
                    ['gaming2.webp', 'Gaming event poster design created for Goethe-Institut Nairobi.'],
                    ['dma.webp', 'DMA Awards 2025.'],
                    ['film.webp', 'Poster design for a dance film screening presented by Goethe-Institut Nairobi.'],
                    ['gaming1.webp', 'Gaming event poster design created for the Goethe-Institut.'],
                    ['dancelife.webp', 'Festival hero artwork capturing the energy and movement of dance.'],
                    ['screening.webp', 'Film screening poster for "Under Our Skin".']
                ]},
                { name: 'Merchandise', base: 'assets/projects/graphic-design/collections/merchandise/', items: [
                    ['training-render.webp', 'Training kit design for Harambee Stars.'],
                    ['home-render.webp', 'Full home kit design for Harambee Stars.'],
                    ['training-front.webp', 'Front view of the Harambee Stars training kit.'],
                    ['home-front.webp', 'Front view of the Harambee Stars home kit.']
                ]},
                { name: 'Branding', base: 'assets/projects/graphic-design/collections/branding/', items: [
                    ['naivaalogo.png', 'Brand identity and logo design for Naivaa Apparel.'],
                    ['athousandislandslogo.png', 'Logo design and visual identity for A Thousand Islands.'],
                    ['alex.png', 'Personal brand logo design for Alexandra Gathukia.']
                ]}
            ]
        },
        {
            key: 'a-thousand-islands', name: 'A Thousand Islands',
            collections: [{ name: 'Gallery', base: 'assets/projects/a-thousand-islands/gallery/', items: [
                ['dynamic-forms.webp', 'Exploring how the particle engine can shift and react.'],
                ['spatial-experience.webp', '3D perception.'],
                ['visual-identity.webp', 'Custom visual inputs.']
            ]}]
        }
    ];

export const CARDS = [];
    PROJECTS.forEach((p, pi) => {
        p.collections.forEach(col => {
            col.items.forEach(([file, desc], ii) => CARDS.push({
                src: col.base + file, project: pi, collection: col.name, desc,
                posInCollection: ii, collectionCount: col.items.length
            }));
        });
    });
    /* Profile has no cards, so findIndex returns -1 for it — mapped to 0 so
       any accidental lookup lands on a valid card rather than breaking. The
       Profile section is never reached through the carousel anyway; only a
       direct icon tap activates it. */
export const PROJECT_START = PROJECTS.map((_, pi) => {
        const idx = CARDS.findIndex(c => c.project === pi);
        return idx === -1 ? 0 : idx;
    });
    /* Profile keeps its slot in PROJECTS (so every index the carousel, the
       tab bar and PROJECT_START already share stays exactly as it was) but no
       longer gets a button inside the bar — it is the round nav button beside
       it now. */
export const PROFILE_TAB = PROJECTS.findIndex(p => p.isProfile);

    /* Home carousel's project video entries — separate from the Gallery
       page's own GALLERY_VIDEOS list below. */
export const VIDEOS = [
        { src: 'assets/projects/a-thousand-islands/videos/adaptive-motion.mp4', title: 'Adaptive Motion' },
        { src: 'assets/projects/a-thousand-islands/videos/particle-engine.mp4', title: 'Particle Engine' },
        { src: 'assets/projects/naivaa/videos/green-bag.mp4', title: 'Nairobi Bags' },
        { src: 'assets/projects/a-thousand-islands/videos/voice-control.mp4', title: 'Voice Control' },
        { src: 'assets/projects/a-thousand-islands/videos/visual-identity.mp4', title: 'Visual Identity' },
        { src: 'assets/projects/graphic-design/videos/alexandra-gathukia.mp4', title: 'Logo Reveal' },
        { src: 'assets/projects/a-thousand-islands/videos/spatial-experience.mp4', title: 'Spatial Experience' },
        { src: 'assets/projects/a-thousand-islands/videos/dynamic-forms.mp4', title: 'Dynamic Forms' }
    ];

export const ICONS = {
        'profile': `<svg viewBox="0 0 64.9 65" aria-hidden="true"><path d="M15.75,16.7c0,9.2,7.5,16.7,16.7,16.7s16.7-7.5,16.7-16.7S41.65,0,32.45,0,15.75,7.5,15.75,16.7Z"/><path d="M1.5,65h61.9c.8,0,1.5-.7,1.5-1.5,0-11.5-5.9-21.9-15.7-27.8-.5-.3-1.1-.3-1.6,0-4.6,2.8-9.8,4.2-15.2,4.2s-10.6-1.5-15.2-4.2c-.5-.3-1.1-.3-1.6,0C5.8,41.6,0,52,0,63.5c0,.8.6,1.5,1.5,1.5h0Z"/></svg>`,
        'naivaa': `<svg viewBox="0 0 207.7 200.9" aria-hidden="true"><path d="M103.9,30.8c-38.5,0-69.7,31.2-69.7,69.7s31.2,69.6,69.7,69.6,69.7-31.2,69.7-69.6S142.3,30.8,103.9,30.8ZM137.4,142.7h-18.3c-2.2,0-5.2-1.3-6.7-2.9l-25.2-27.2c-1.5-1.6-2.7-1.1-2.7,1.1v25.1c0,2.2-1.8,4-4,4h-10.1c-2.2,0-4-1.8-4-4v-67.1c0-2.2,1.3-2.7,2.8-1.2l69.5,69.5c1.5,1.5,1,2.8-1.2,2.8ZM141.4,128.8c0,2.2-1.3,2.7-2.8,1.2L69.6,61c-1.5-1.5-1-2.8,1.2-2.8h15.4c1,0,3,1.3,4.6,2.8l29.7,29.6c1.6,1.6,2.8,1,2.8-1.2v-27.2c0-2.2,1.8-4,4-4h10.1c2.2,0,4,1.8,4,4v66.6Z"/></svg>`,
        'digital-art': `<svg viewBox="0 0 90 75" aria-hidden="true"><path d="M75,9.4h-.8l-6.9,7.5h5.8c1,0,1.9.8,1.9,1.9v31.9c0,1-.8,1.9-1.9,1.9H16.9c-1,0-1.9-.8-1.9-1.9v-31.9c0-1,.8-1.9,1.9-1.9h29.1l8.2-7.5H15c-4.1,0-7.5,3.4-7.5,7.5v41.2c0,1,.8,1.9,1.9,1.9h71.2c1,0,1.9-.8,1.9-1.9V16.9c0-4.1-3.4-7.5-7.5-7.5h0Z"/><path d="M87.2,63.8h-27.9c-.7,0-1.4.4-1.7,1l-.3.6c-.6,1.3-1.9,2.1-3.4,2.1h-17.9c-1.4,0-2.7-.8-3.4-2.1l-.3-.6c-.3-.6-1-1-1.7-1H2.8c-1.6,0-2.8,1.3-2.8,2.8v.9c0,4.1,3.4,7.5,7.5,7.5h75c4.1,0,7.5-3.4,7.5-7.5v-.9c0-1.6-1.3-2.8-2.8-2.8h0Z"/><path d="M42.6,35.8c0,1.4-.6,2.9-1.7,3.9-2.7,2.6-6,3.6-10.4,3.6-.8,0-1.2-.9-.8-1.5,3.3-4.4,1.6-5.7,4.8-8.9s2.4-1.5,3.7-1.5h0c.4,1,1,1.9,1.8,2.7.8.8,1.7,1.4,2.6,1.8h0Z"/><path d="M73.1.9c-1.1-1.1-2.9-1.2-4.1,0l-26.3,24.1c-1.9,1.7-1.9,4.7-.1,6.5,1.8,1.8,4.8,1.7,6.5-.1l24.1-26.3c1.1-1.2,1-2.9,0-4.1h0Z"/></svg>`,
        'graphic-design': `<svg viewBox="0 0 76 84" aria-hidden="true"><path d="M39.71,10.97l-.03-.03c-.08-.13-.18-.25-.29-.36-.02-.02-.04-.03-.06-.05-.1-.09-.2-.16-.31-.23-.04-.02-.08-.05-.12-.07-.1-.05-.21-.09-.32-.13-.04-.01-.08-.03-.13-.04-.15-.04-.31-.06-.47-.06s-.32.02-.47.06c-.04.01-.08.03-.13.04-.11.03-.22.08-.32.13-.04.02-.08.04-.12.07-.11.07-.22.15-.31.23-.02.02-.04.03-.06.05-.11.11-.2.23-.29.36l-.03.03L12.26,50.97c-.47.79-.35,1.79.3,2.44l2.93,2.93c4.21,4.19,6.51,9.75,6.51,15.66v10c0,1.1.9,2,2,2s2-.9,2-2v-8h24v8c0,1.1.9,2,2,2s2-.9,2-2v-10c0-5.91,2.3-11.47,6.49-15.66l2.93-2.93c.65-.65.77-1.66.3-2.44L39.71,10.97ZM38,48c2.21,0,4,1.79,4,4s-1.79,4-4,4-4-1.79-4-4,1.79-4,4-4ZM57.66,53.51c-4.46,4.46-7.11,10.26-7.58,16.49h-24.16c-.47-6.23-3.12-12.02-7.58-16.49l-1.82-1.82,19.48-32.47v25.04c-3.44.89-6,4.02-6,7.74,0,4.41,3.59,8,8,8s8-3.59,8-8c0-3.72-2.56-6.85-6-7.74v-25.04l19.48,32.47-1.82,1.82ZM76,2c0,1.1-.9,2-2,2h-19.54c11.59,5.99,19.54,18.08,19.54,32,0,1.1-.9,2-2,2s-2-.9-2-2c0-17.64-14.36-32-32-32S6,18.36,6,36c0,1.1-.9,2-2,2s-2-.9-2-2C2,22.08,9.95,9.99,21.54,4H2c-1.1,0-2-.9-2-2S.9,0,2,0h72c1.1,0,2,.9,2,2Z"/></svg>`,
        'a-thousand-islands': `<svg viewBox="0 0 764.5 703.5" aria-hidden="true"><path fill-rule="evenodd" d="M323.8,239.7c33.9-2.5,76.4-1.2,110.4.8,26.8,1.6,36.1,2.4,59.5,16.4,19.8,11.9,80.1,51.4,92.7,67.3s9.7,16.6,11.5,25.8c3.9,20,5.3,72-2.5,90.3-11.2,26.3-47.9,26-72.2,24.1-53.5-4.2-101.8-74.1-146.8-69.9-30.1,2.8-73.8,47.8-104.8,61.3-27.1,11.8-88.2,18-102.5-15.1-8-18.7-7.1-82.5,0-101.8s50.2-47.9,69.2-60.8c29-19.8,48.7-35.7,85.6-38.4ZM374.3,258.9c-34.3,4.7-75.8,56.4-116.7,67.4-28.5,7.7-64.9-4.8-78.6,29.8s-9.6,69.5,19.2,72.2,67.2-37.5,94.9-48.4c21-8.2,55.1-4.2,78.5-4.5s76.2-7.1,106.5,7.7c25.8,12.7,98.4,80.6,110.3,20.2,4-20.5,1.7-50.3-15.9-64-16.6-13-39.2-7.5-58.6-11.2-33.8-6.5-60.7-32.9-88.4-51.2-16.7-11-29.7-20.9-51.2-18Z"/></svg>`
    };

