/** Particle + viz color data extracted from renderer COLOR_THEMES */
const PARTICLE_THEMES = {
    "kraken": {
        "hueBase": 190,
        "hueRange": 40,
        "saturation": 80,
        "accentRgb": [
            59,
            158,
            190
        ],
        "bubbleHighRgb": [
            120,
            200,
            255
        ],
        "rainRgb": [
            150,
            200,
            255
        ]
    },
    "grayscale": {
        "hueBase": 0,
        "hueRange": 0,
        "saturation": 0,
        "accentRgb": [
            160,
            160,
            160
        ],
        "bubbleHighRgb": [
            200,
            200,
            200
        ],
        "rainRgb": [
            180,
            180,
            180
        ]
    },
    "purple": {
        "hueBase": 270,
        "hueRange": 40,
        "saturation": 80,
        "accentRgb": [
            140,
            80,
            200
        ],
        "bubbleHighRgb": [
            180,
            140,
            255
        ],
        "rainRgb": [
            170,
            150,
            255
        ]
    },
    "red": {
        "hueBase": 0,
        "hueRange": 30,
        "saturation": 80,
        "accentRgb": [
            200,
            60,
            60
        ],
        "bubbleHighRgb": [
            255,
            140,
            140
        ],
        "rainRgb": [
            255,
            150,
            150
        ]
    },
    "blue": {
        "hueBase": 220,
        "hueRange": 40,
        "saturation": 80,
        "accentRgb": [
            60,
            100,
            200
        ],
        "bubbleHighRgb": [
            130,
            180,
            255
        ],
        "rainRgb": [
            140,
            180,
            255
        ]
    },
    "orange": {
        "hueBase": 30,
        "hueRange": 30,
        "saturation": 80,
        "accentRgb": [
            200,
            130,
            40
        ],
        "bubbleHighRgb": [
            255,
            200,
            120
        ],
        "rainRgb": [
            255,
            210,
            150
        ]
    },
    "green": {
        "hueBase": 140,
        "hueRange": 40,
        "saturation": 80,
        "accentRgb": [
            40,
            180,
            100
        ],
        "bubbleHighRgb": [
            120,
            235,
            180
        ],
        "rainRgb": [
            150,
            240,
            200
        ]
    },
    "pink": {
        "hueBase": 330,
        "hueRange": 40,
        "saturation": 80,
        "accentRgb": [
            200,
            70,
            130
        ],
        "bubbleHighRgb": [
            255,
            160,
            210
        ],
        "rainRgb": [
            255,
            180,
            210
        ]
    }
};

function getParticleTheme(themeId) {
    return PARTICLE_THEMES[themeId] || PARTICLE_THEMES.kraken;
}

module.exports = { PARTICLE_THEMES, getParticleTheme };
