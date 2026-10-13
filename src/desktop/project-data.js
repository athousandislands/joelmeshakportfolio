export const allProjectsData = [
        {
            title: "naivaa",
            collections: [
                {
                    title: "summer-land",
                    description: "Graphic tees inspired by Nairobi’s music and street culture.<br>Exploring the relationship between sound, fashion and identity.",
                    gallery: [
                        "assets/projects/naivaa/collections/summer-land/gallery/summerland3.webp",
                        "assets/projects/naivaa/collections/summer-land/gallery/summerland2.webp",
                        "assets/projects/naivaa/collections/summer-land/gallery/summerland-description.webp"
                    ]
                },
                {
                    title: "chokoleti",
                    description: "Heavyweight hoodies in a palette of earth tones.<br>Designed to celebrate confidence and identity through colour.",
                    gallery: [
                        "assets/projects/naivaa/collections/chokoleti/gallery/chokoleti-hero.jpg",
                        "assets/projects/naivaa/collections/chokoleti/gallery/models.jpg",
                        "assets/projects/naivaa/collections/chokoleti/gallery/hoodie.jpg",
                        "assets/projects/naivaa/collections/chokoleti/gallery/mocha.jpg",
                        "assets/projects/naivaa/collections/chokoleti/gallery/Chokoleti2.webp"
                    ]
                },
                {
                    title: "slidr",
                    description: "Minimal slides designed for everyday wear, indoors and out.<br>Built around comfort, durability and understated branding.",
                    gallery: [
                        "assets/projects/naivaa/collections/slidr/gallery/black-slides.jpg",
                        "assets/projects/naivaa/collections/slidr/gallery/white-slides.jpg",
                        "assets/projects/naivaa/collections/slidr/gallery/slides.jpg",
                        "assets/projects/naivaa/collections/slidr/gallery/white-slides2.jpg",
                        "assets/projects/naivaa/collections/slidr/gallery/slidr.webp"
                    ]
                },
                {
                    title: "nairobi-bags",
                    description: "Leather bags featuring handwoven Ghanaian kente. Illustrated in collaboration with internationally acclaimed artist Brian Omolo, celebrating the Spirit of Nairobi.",
                    gallery: ["assets/projects/naivaa/collections/nairobi-bags/gallery/bags.jpg"]
                }
            ],
            videoTitle: "Nairobi Bags Visualisation",
            videoDescription: "",
            videos: ["assets/projects/naivaa/videos/green-bag.mp4"]
        },
        {
            title: "a-thousand-islands",
            galleryDescription: "A look inside Echo and Pulse, documenting the UI and visual systems behind each product.<br>Echo is audio-reactive, while Pulse responds to hand gestures in real time.",
            gallery: [
                "assets/projects/a-thousand-islands/gallery/dynamic-forms.webp",
                "assets/projects/a-thousand-islands/gallery/spatial-experience.webp",
                "assets/projects/a-thousand-islands/gallery/visual-identity.webp"
            ],
            videoDescription: "Product demonstrations of Echo and Pulse in action.<br>Showcasing audio-reactive particles and gesture-controlled visual interfaces.",
            videos: [
                "assets/projects/a-thousand-islands/videos/adaptive-motion.mp4",
                "assets/projects/a-thousand-islands/videos/particle-engine.mp4",
                "assets/projects/a-thousand-islands/videos/voice-control.mp4",
                "assets/projects/a-thousand-islands/videos/visual-identity.mp4",
                "assets/projects/a-thousand-islands/videos/spatial-experience.mp4",
                "assets/projects/a-thousand-islands/videos/dynamic-forms.mp4"
            ]
        },
        {
            title: "graphic-design",
            cardScale: 1.26,
            collections: [
                {
                    title: "posters",
                    description: "A selection of poster designs created across a range of projects and campaigns.",
                    gallery: [
                        "assets/projects/graphic-design/collections/posters/amka.webp",
                        "assets/projects/graphic-design/collections/posters/gaming2.webp",
                        "assets/projects/graphic-design/collections/posters/dma.webp",
                        "assets/projects/graphic-design/collections/posters/film.webp",
                        "assets/projects/graphic-design/collections/posters/gaming1.webp",
                        "assets/projects/graphic-design/collections/posters/dancelife.webp",
                        "assets/projects/graphic-design/collections/posters/screening.webp"
                    ]
                },
                {
                    title: "merchandise",
                    description: "Product mock-ups exploring kit design concepts for the Harambee Stars national team.",
                    gallery: [
                        "assets/projects/graphic-design/collections/merchandise/training-render.webp",
                        "assets/projects/graphic-design/collections/merchandise/home-render.webp",
                        "assets/projects/graphic-design/collections/merchandise/training-front.webp",
                        "assets/projects/graphic-design/collections/merchandise/home-front.webp"
                    ]
                },
                {
                    title: "branding",
                    description: "Selected logo and identity systems designed for commercial clients.",
                    gallery: [
                        "assets/projects/graphic-design/collections/branding/naivaalogo.png",
                        "assets/projects/graphic-design/collections/branding/athousandislandslogo.png",
                        "assets/projects/graphic-design/collections/branding/alex.png"
                    ]
                }
            ],
            videoTitle: "Logo Reveal",
            videoDescription: "",
            videos: ["assets/projects/graphic-design/videos/alexandra-gathukia.mp4"]
        },
        {
            title: "digital-art",
            cardScale: 1.26,
            galleryDescription: "Digital artworks exploring Black identity, technology and speculative futures.<br>Created between 2021 and the present.",
            gallery: [
                "assets/projects/digital-art/gallery/dreamers-residency.webp",
                "assets/projects/digital-art/gallery/hair.png",
                "assets/projects/digital-art/gallery/creator.png",
                "assets/projects/digital-art/gallery/corteiz.png",
                "assets/projects/digital-art/gallery/bizaar.webp",
                "assets/projects/digital-art/gallery/self.png",
                "assets/projects/digital-art/gallery/mirror.png",
                "assets/projects/digital-art/gallery/facade.webp",
                "assets/projects/digital-art/gallery/surreal.webp",
                "assets/projects/digital-art/gallery/hurricane.webp"
            ],
            videoTitle: "Queen of Everything",
            videoDescription: "",
            videos: ["assets/projects/digital-art/videos/queen.webm"]
        }
    ];

export function formatTitle(str) {
        return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

export function buildMediaData(project) {
        const data = [];
        if (project.collections) {
            project.collections.forEach(col => {
                data.push({
                    title: formatTitle(col.title),
                    description: col.description !== undefined ? col.description : "Explore the " + formatTitle(col.title) + " collection.",
                    assets: col.gallery.map(src => ({ type: 'img', src }))
                });
            });
        }
        if (project.gallery && !project.collections) {
            data.push({
                title: project.galleryTitle !== undefined ? project.galleryTitle : "Gallery",
                description: project.galleryDescription !== undefined ? project.galleryDescription : "A curated selection of works.",
                assets: project.gallery.map(src => ({ type: 'img', src }))
            });
        }
        if (project.videos && project.videos.length) {
            data.push({
                title: project.videoTitle !== undefined ? project.videoTitle : "Video",
                description: project.videoDescription !== undefined ? project.videoDescription : "Cinematic explorations and motion design.",
                assets: project.videos.map(src => ({ type: 'video', src }))
            });
        }
        return data;
    }

