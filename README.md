# rainbow-fluid
cursor-controlled rainbow fluid / gradient animation
# Rainbow Fluid

A cursor-controlled rainbow fluid simulation that runs in the browser. It solves real incompressible fluid equations (stable fluids) on the GPU with WebGL2. No dependencies and no build step.

## Features

- Move the cursor to push the fluid and paint a rainbow trail
- Click or tap for a 12-color burst
- Drifts on its own when idle
- Touch support

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Tweak it

Constants at the top of `js/main.js`:

| Name                 | What it does                                              |

| `FORCE`              | How hard the cursor pushes the fluid                      |
| `DYE_AMOUNT`         | How much color each splat adds                            |
| `DYE_DISSIPATION`    | How fast color fades (lower = longer trails)              |
| `VEL_DISSIPATION`    | How fast motion dies out                                  |
| `SIM` / `DYE`        | Velocity and color grid resolutions                       |
| `PRESSURE_ITER`      | Pressure solver iterations (more = more accurate, slower) |
| `IDLE_MS`            | Stillness time before the idle animation starts           |

## How it works

Each frame: splat cursor velocity and color, advect velocity, advect color, compute divergence, run Jacobi pressure iterations, subtract the pressure gradient, then draw the color field with tone mapping.



## Requirements

A browser with WebGL2 and `EXT_color_buffer_float` (all current Chrome, Edge, Firefox, Safari).

## License

MIT
