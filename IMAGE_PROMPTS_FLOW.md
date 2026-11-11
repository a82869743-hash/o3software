# O3 Car Spaa — photo prompts for Google Flow

These cover every service type that doesn't have a real photo yet. Generate each one, download it, and send them all
together with the file names shown. I'll compress them into `client/public/photos/` and switch them on. Then:
- every service, package, booking card and home tile with a matching name uses its photo automatically, and
- all of them (plus the 4 existing photos) show in **Admin → Services / Packages → Picture → Choose from library → Real photos**,
  so the studio can pick any photo for any service by hand.

**Settings for all:** square 1:1 (or 4:3), photorealistic, no text, no logos or brand badges, no faces (hands in gloves are
fine). Look: premium Indian car-detailing studio, clean dark-grey floor, cool blue LED light strips, deep-blue or
white cars. That keeps them in the O3 blue theme.

Already done (no need to redo): car wash (foam), ceramic coating, PPF, interior.

| # | Save as | Prompt |
|---|---|---|
| 1 | `polish.webp` | Hyper-realistic close-up of a dual-action machine polisher with a blue foam pad buffing a glossy deep-blue car door, visible swirl-free mirror reflection of blue LED studio lights, gloved hand, shallow depth of field, no text, no logos |
| 2 | `wax.webp` | Hyper-realistic close-up of a gloved hand applying carnauba wax with a round blue applicator on a glossy dark car bonnet, rich wet-look shine, soft blue studio lighting, no text, no logos |
| 3 | `headlight.webp` | Hyper-realistic before/after style shot of a car headlight being restored: one half yellow and foggy, the other half crystal clear, detailer's gloved hand with polishing pad, blue studio light, no text, no logos |
| 4 | `glass.webp` | Hyper-realistic close-up of water beading on a car windshield treated with glass coating, droplets rolling off, blue-lit detailing studio blurred in background, no text, no logos |
| 5 | `wheels.webp` | Hyper-realistic close-up of an alloy wheel being cleaned with a soft brush and white foam, tyre being dressed to a satin black finish, blue studio lighting, no text, no logos |
| 6 | `engine.webp` | Hyper-realistic photo of a clean modern car engine bay being detailed with a soft brush and microfiber, dressed plastics, cool blue light, no text, no logos |
| 7 | `underbody.webp` | Hyper-realistic photo of a car on a lift in a detailing studio, technician spraying black anti-rust underbody coating, blue LED lights, no faces, no text, no logos |
| 8 | `sanitize.webp` | Hyper-realistic photo of a car interior being sanitised with a fine mist fogger, soft light beams through the mist, clean beige seats, no faces, no text, no logos |
| 9 | `leather.webp` | Hyper-realistic close-up of a gloved hand conditioning a tan leather car seat with a soft applicator, rich leather texture, premium cabin, no text, no logos |
| 10 | `steam.webp` | Hyper-realistic photo of a steam cleaner nozzle cleaning a car's fabric seat and dashboard, visible steam, clean modern interior, no faces, no text, no logos |
| 11 | `tint.webp` | Hyper-realistic photo of a technician's gloved hands applying dark sun-control film to a car side window with a squeegee, blue studio lighting, no faces, no text, no logos |
| 12 | `scratch.webp` | Hyper-realistic close-up of a scratch being removed from a glossy blue car panel with a polishing compound and pad, half of the panel scratched and half flawless, no text, no logos |
| 13 | `dentpaint.webp` | Hyper-realistic photo of a car body panel being repainted in a clean paint booth, painter's spray gun misting deep-blue paint, protective suit, no face, no text, no logos |
| 14 | `ac.webp` | Hyper-realistic photo of a car AC service: gauges and hoses connected under an open bonnet, technician's gloved hands, clean workshop with blue lighting, no text, no logos |
| 15 | `mechanic.webp` | Hyper-realistic photo of a car general service in a clean workshop, wheel off and brake disc visible, torque wrench in gloved hand, blue LED lights, no face, no text, no logos |
| 16 | `inspection.webp` | Hyper-realistic photo of a detailer inspecting a car's paint with a handheld swirl-finder LED light, glossy blue car, dark studio, no face, no text, no logos |
| 17 | `wrap.webp` | Hyper-realistic photo of a car being wrapped in satin colour-change vinyl, gloved hands with a heat gun and squeegee on the bonnet, blue studio light, no face, no text, no logos |
| 18 | `graphene.webp` | Hyper-realistic macro shot of extreme water beading on a jet-black car bonnet with graphene coating, tiny perfect droplets, studio light reflections, no text, no logos |
| 19 | `pickup.webp` | Hyper-realistic photo of a car being driven out of a premium detailing studio at dusk by a uniformed driver (seen from behind), clean shiny car, blue studio glow, no face, no text, no logos |
| 20 | `doorstep.webp` | Hyper-realistic photo of a doorstep car wash outside an Indian apartment building, detailer with a portable foam sprayer and water tank, glossy white SUV, morning light, no face, no text, no logos |
| 21 | `packages.webp` | Hyper-realistic wide photo of a glossy deep-blue car parked in a premium detailing studio with blue LED ceiling lines, everything spotless, wide empty space on the left for text, no text, no logos |
| 22 | `shop.webp` | Hyper-realistic product photo of premium car-care bottles (shampoo, polish, ceramic spray, microfiber towels) neatly arranged on a dark display shelf with blue backlight, labels blank, no text, no logos |
| 23 | `studio-hero.webp` (admin dashboard + app banners) | Hyper-realistic wide photo of a modern car detailing studio interior at night: two cars on bays, blue LED light tunnels on the ceiling, polished epoxy floor, no people, no text, no logos |

**Tip:** if Flow adds text or a badge to an image, regenerate it. Sizes from 1024 px wide upwards are fine; I'll compress them.

---

## Products

Moved to `PRODUCT_IMAGE_PROMPTS.md` (12 prompts in 2 batches of 6, saved to a separate product image library).
