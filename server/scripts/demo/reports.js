/**
 * What residents actually reported.
 *
 * Two things make this read as a real complaint stream rather than a table
 * somebody filled: every report names a place a person could walk to, and the
 * description says how long it has been there, who it affects and what the
 * reporter saw. "Garbage problem in Mumbai" tells an officer nothing and tells
 * a reader that the data is fake.
 *
 * Each category has several phrasings and each is filled with a different
 * landmark, so no two reports in the same category read the same way.
 */

/**
 * Landmarks by ward, with the ward's approximate centre.
 *
 * Reports are placed near the centre with a deterministic offset per landmark,
 * so a ward's reports scatter across it instead of stacking on one pin, and a
 * rerun puts them in the same places.
 */
export const WARDS = {
  A: { centre: [18.925, 72.832], places: ["the Colaba Causeway market entrance", "the BEST bus terminus at Colaba", "the lane behind Sassoon Dock", "the footpath outside the Regal cinema junction", "the Cuffe Parade service road"] },
  B: { centre: [18.956, 72.839], places: ["the Dongri police chowky lane", "the Sandhurst Road station approach", "the JJ Hospital gate no. 2 road", "the Umerkhadi crossing"] },
  C: { centre: [18.949, 72.827], places: ["the Kalbadevi jewellery market lane", "the Marine Lines station subway", "the Princess Street flyover approach", "the Zaveri Bazaar side lane"] },
  D: { centre: [18.962, 72.806], places: ["the Walkeshwar Road bend", "the Girgaon Chowpatty service road", "the Napean Sea Road bus stop", "the Hughes Road junction"] },
  E: { centre: [18.976, 72.834], places: ["the Byculla station east approach", "the Rani Baug entrance road", "the Mazgaon dock road", "the Nagpada junction", "the Clare Road market"] },
  "F-South": { centre: [18.998, 72.841], places: ["the Parel workshop gate road", "the KEM Hospital approach road", "the Sewri koliwada lane", "the Lalbaug flyover underpass"] },
  "F-North": { centre: [19.032, 72.858], places: ["the Matunga Labour Camp lane", "the Sion Circle service road", "the Five Gardens footpath", "the Dadar TT flyover approach", "the Sion Hospital gate road"] },
  "G-South": { centre: [19.007, 72.818], places: ["the Worli naka bus stop", "the Prabhadevi temple lane", "the Lower Parel station east approach", "the Century Bazaar junction"] },
  "G-North": { centre: [19.024, 72.841], places: ["the Dadar West flower market lane", "the Shivaji Park footpath", "the Mahim causeway service road", "the Kabutarkhana junction", "the Plaza cinema lane"] },
  "H-East": { centre: [19.082, 72.851], places: ["the Kalina university campus road", "the Vakola market lane", "the Santacruz East station approach", "the Air India colony road"] },
  "H-West": { centre: [19.055, 72.831], places: ["the Bandra Linking Road footpath", "the Hill Road market stretch", "the Bandra Bandstand promenade", "the Pali Naka junction", "the Bandra West station rickshaw stand"] },
  "K-East": { centre: [19.118, 72.866], places: ["the Marol MIDC road", "the Andheri East station bridge approach", "the Chakala junction", "the Sakinaka signal", "the JB Nagar market lane"] },
  "K-West": { centre: [19.136, 72.828], places: ["the Lokhandwala back road", "the Versova jetty road", "the Andheri West station subway", "the Four Bungalows junction", "the Oshiwara bridge approach"] },
  L: { centre: [19.072, 72.882], places: ["the Kurla station west access road", "the Nehru Nagar service lane", "the Kurla bus depot road", "the Premier Road industrial stretch", "the Kajupada crossing", "the LBS Marg junction at Kurla"] },
  "M-East": { centre: [19.055, 72.925], places: ["the Govandi station road", "the Shivaji Nagar transit camp lane", "the Deonar market approach", "the Mankhurd link road service lane", "the Baiganwadi crossing"] },
  "M-West": { centre: [19.048, 72.897], places: ["the Chembur naka junction", "the Diamond Garden footpath", "the Chembur station east approach", "the Basant Park road", "the Sion-Trombay Road service lane"] },
  N: { centre: [19.086, 72.908], places: ["the Ghatkopar station east approach", "the Rajawadi Hospital road", "the Pant Nagar market lane", "the Vidyavihar station road", "the Garodia Nagar circle"] },
  "P-South": { centre: [19.164, 72.849], places: ["the Goregaon East station bridge", "the Aarey Road junction", "the Bangur Nagar market lane", "the Goregaon West link road"] },
  "P-North": { centre: [19.186, 72.848], places: ["the Malad West market road", "the Malad station subway", "the Marve Road stretch", "the Kurar village lane"] },
  "R-South": { centre: [19.204, 72.841], places: ["the Kandivali West station approach", "the Charkop sector 8 road", "the Poisar bus depot lane", "the Mahavir Nagar junction"] },
  "R-Central": { centre: [19.229, 72.857], places: ["the Borivali station west subway", "the Chandavarkar Road market", "the IC Colony service road", "the Eksar Road junction"] },
  "R-North": { centre: [19.250, 72.860], places: ["the Dahisar check naka road", "the Dahisar East station approach", "the Anand Nagar lane", "the Rawalpada crossing"] },
  S: { centre: [19.147, 72.936], places: ["the Powai lakeside road", "the Bhandup station west approach", "the Kanjurmarg east service road", "the Hiranandani gardens footpath", "the Vikhroli Park Site lane"] },
  T: { centre: [19.172, 72.956], places: ["the Mulund station west market", "the Nahur station approach road", "the Mulund check naka", "the Johnson & Johnson junction", "the Sarvodaya Hospital road"] },
};

/**
 * How a report is worded, per category.
 *
 * Each entry is a list of functions of the landmark. Several phrasings per
 * category, and the pool of landmarks is large, so the stream does not fall
 * into one sentence shape repeated with a noun swapped.
 */
export const DESCRIPTIONS = {
  POTHOLE: [
    (p) => `A large pothole has opened up on the carriageway near ${p}. It is roughly the width of a scooter and fills with water whenever it rains, so riders cannot judge the depth. Two-wheelers swerve into the next lane to avoid it and there have been several near misses during the morning rush.`,
    (p) => `The road surface near ${p} has broken up over the last three weeks and there are now four or five potholes across the left lane. Autorickshaws slow to a crawl and traffic backs up towards the signal. One of the holes has exposed the aggregate underneath.`,
    (p) => `There is a deep pothole just past ${p}, right where vehicles turn. It was patched during the last monsoon but the filling has come away again. Buses drop into it heavily and the noise carries into the buildings alongside.`,
  ],
  ROADCRACK: [
    (p) => `A long crack has developed along the centre of the road near ${p}. It has widened noticeably since the rains and in places the edges have started to lift. It is not yet a hole, but it is heading that way and is easier to fix now.`,
    (p) => `The road surface outside ${p} is cracked in a grid pattern across roughly ten metres. Loose pieces come away when heavy vehicles pass and collect at the edge of the road.`,
  ],
  MANHOLE: [
    (p) => `A manhole cover near ${p} is missing and the opening is unguarded. Someone has stood a broken branch in it as a warning, which will not survive the night. This is on a route people walk to the station in the dark.`,
    (p) => `The manhole cover outside ${p} is broken across the middle and has sunk below the road level. It rocks and clangs each time a vehicle passes and the gap is wide enough for a foot to go through.`,
    (p) => `An open drain chamber near ${p} has been left uncovered since work was carried out last week. The barricade that was put up has been pushed aside and children use this lane to reach the playground.`,
  ],
  FOOTPATH: [
    (p) => `Two sections of the footpath outside ${p} have broken away, leaving exposed concrete and an uneven surface. Students and senior citizens are using the road edge to avoid the damaged section, particularly during the evening.`,
    (p) => `The paver blocks along the footpath at ${p} have come loose over a stretch of about fifteen metres. Several are missing entirely and the sand beneath has washed out, so the surface moves underfoot.`,
    (p) => `The footpath near ${p} drops sharply where a slab has subsided. It is hard to see in the evening because the nearest light is some distance away, and an elderly resident tripped there last week.`,
  ],
  ROADOBST: [
    (p) => `Construction material has been stacked across half the road near ${p} and has not moved for over a week. Vehicles from both directions are squeezing through a single gap and the junction backs up badly in the evening.`,
    (p) => `A broken-down tempo has been left at the side of the road at ${p} for more than ten days. It has become a fixed obstruction and other vehicles now park around it, narrowing the road further.`,
  ],
  GARBAGE: [
    (p) => `Garbage has been accumulating beside the pedestrian entrance near ${p} for approximately five days. The collection point is overflowing into the footpath and residents are having to walk onto the road to pass the area. There is also a noticeable foul smell during the afternoon.`,
    (p) => `The community bin at ${p} has not been cleared since the weekend. Waste is now piled around the outside of it and stray dogs have pulled bags into the lane overnight.`,
    (p) => `Household waste is being left in a heap at the corner near ${p} because the bin was removed and not replaced. The pile grows every morning and nothing has been collected from that spot in over a fortnight.`,
  ],
  DUMPING: [
    (p) => `A load of household and shop waste has been dumped overnight on the open plot beside ${p}. This is the third time this month and it always appears before dawn. Residents believe it is being brought in by a vehicle rather than left by people living nearby.`,
    (p) => `Somebody is dumping waste regularly at the edge of the road near ${p}, including broken furniture and packaging. The spot is out of sight of the main road, which seems to be why it has been chosen.`,
  ],
  DEADANIMAL: [
    (p) => `A dead dog has been lying at the roadside near ${p} since yesterday morning. The smell has become strong and shopkeepers have covered it with a sack. It needs to be removed today.`,
    (p) => `There is a dead cat in the drain opening near ${p}. It is partially blocking the flow and the water around it has begun to stagnate.`,
  ],
  DEBRIS: [
    (p) => `Rubble from a building repair has been left on the footpath outside ${p} for over two weeks. It covers the full width of the path and pedestrians step into the traffic lane to get past.`,
    (p) => `Construction debris and broken tiles have been pushed to the side of the road near ${p}. Fine dust blows off the pile whenever a vehicle passes and it is settling on the shopfronts opposite.`,
  ],
  LEAK: [
    (p) => `Water has been leaking continuously from a joint in the pipeline near ${p} for about ten days. It runs across the road and never dries, so the surface there has started to break up. Given the supply timings in this area, the waste is hard to watch.`,
    (p) => `There is a steady leak from the water line outside ${p}. It is not a burst, but it has been running day and night for a fortnight and the lane is permanently wet.`,
    (p) => `A leaking connection near ${p} has created a constant stream along the edge of the road. Residents have been collecting it in buckets, which suggests how much is being lost.`,
  ],
  PIPELINE: [
    (p) => `A water main has burst near ${p} and water is coming up through the road surface with some force. The road has been closed by residents using whatever they could find. This started around 6 AM today.`,
    (p) => `The pipeline running alongside ${p} has fractured and is flooding the service lane. Supply to several buildings has dropped noticeably since it started.`,
  ],
  NOWATER: [
    (p) => `Buildings around ${p} have had no water supply for four consecutive days. Residents are buying tankers at their own cost. The ward office has been contacted by phone but no timeline has been given.`,
    (p) => `Supply near ${p} has reduced to about twenty minutes a day at very low pressure, down from the usual schedule. Upper floors are receiving nothing at all.`,
  ],
  CONTAMINATED: [
    (p) => `The water supplied to buildings near ${p} has been coming out brownish and with a distinct smell for the past three days. Several families have reported stomach complaints. People have stopped drinking it and are boiling it even for cooking.`,
    (p) => `Tap water in the lane behind ${p} has a strong chlorine-like odour and leaves sediment when left standing. This started after digging work was carried out on the road.`,
  ],
  FLOOD: [
    (p) => `Water collects to knee height near ${p} within twenty minutes of heavy rain and takes several hours to drain away. Shops on that stretch shut early on rainy days and the approach becomes impassable on foot. This has happened every monsoon for at least three years.`,
    (p) => `The stretch outside ${p} was waterlogged again yesterday evening. Vehicles stalled in it and the water reached the doorsteps of ground-floor homes. The drains alongside were full and not taking anything.`,
    (p) => `Rainwater accumulates near ${p} and does not clear because the road level is higher on both sides. Pedestrians cannot judge where the footpath ends and there is an open drain along that edge.`,
  ],
  DRAINBLOCK: [
    (p) => `The storm-water drain near ${p} is blocked with silt and plastic and the water is standing rather than flowing. The gratings have not been lifted and cleaned this season.`,
    (p) => `A drain running past ${p} is choked and overflowing onto the footpath. The smell is strong enough that the shops on that side keep their shutters half down.`,
  ],
  STREETLIGHT: [
    (p) => `The streetlight outside ${p} has remained non-functional for around three weeks. The surrounding lane becomes poorly lit after 7 PM and residents have reported difficulty identifying pedestrians and vehicles entering the lane.`,
    (p) => `Four consecutive lights along the stretch at ${p} are out. The road is used by people walking back from the station and the darkness now runs for about a hundred metres.`,
    (p) => `The light near ${p} flickers on and off through the night and has been doing so for over a month. It has now stopped coming on at all for the past four days.`,
  ],
  EXPOSEDWIRE: [
    (p) => `A bundle of electrical wires has come loose from the pole near ${p} and now hangs at about head height over the footpath. Some of the insulation is damaged. People are ducking under it and it is directly above a spot where water collects.`,
    (p) => `The junction box on the pole outside ${p} is open with wires visible. It has been like this since the last repair work and is within reach of anybody standing on the footpath.`,
  ],
  DAMAGEDPOLE: [
    (p) => `The electrical pole near ${p} is leaning noticeably after the rain and the base has loosened in the soil. Wires are pulling on it from one side.`,
    (p) => `A pole at ${p} was hit by a vehicle and is now bent at the base. It has not been attended to for over a week and there are shops directly underneath.`,
  ],
  SIGNAL: [
    (p) => `The traffic signal at ${p} has been out since Saturday. There is no constable posted and vehicles from three directions are negotiating the junction themselves. It is worst between 9 and 11 in the morning.`,
    (p) => `Only the amber light is working at the signal near ${p}. Drivers are treating the junction as a free crossing and pedestrians have nowhere safe to wait.`,
  ],
  SIGNBOARD: [
    (p) => `The one-way sign at ${p} has been knocked down and is lying in the gutter. Vehicles unfamiliar with the area are entering against the flow several times an hour.`,
    (p) => `The direction board near ${p} has faded to the point where it cannot be read, and a tree branch now covers what is left of it.`,
  ],
  PARKING: [
    (p) => `Vehicles are being parked on both sides of the road near ${p}, leaving barely enough width for one car. An ambulance was stuck there last Tuesday for several minutes. This happens every evening from about 7 PM.`,
    (p) => `Cars are being parked across the footpath at ${p} throughout the day, so pedestrians walk in the traffic lane. There is a no-parking board on the wall that is being ignored.`,
  ],
  STAGNANT: [
    (p) => `Water has been standing in the open plot beside ${p} for more than two weeks since the last rain. It has turned green and there is a visible mosquito problem in the buildings alongside, especially after sunset.`,
    (p) => `A depression in the road near ${p} holds water permanently because it has nowhere to drain. It has become a breeding spot and the smell is noticeable in the afternoon.`,
  ],
  MOSQUITO: [
    (p) => `Mosquito numbers around ${p} have risen sharply over the past month. There is stored water and discarded containers on the vacant plot behind, and no fogging has been carried out in this lane this season. Two children in the building have had dengue.`,
    (p) => `The overhead tank area near ${p} has standing water around its base and mosquitoes are breeding there. Residents on the lower floors cannot keep windows open in the evening.`,
  ],
  TOILET: [
    (p) => `The public toilet block near ${p} has had no water supply for over a week and is now unusable. The doors on two of the cubicles are broken. It is the only facility available to the people working at the market.`,
    (p) => `The community toilet at ${p} is not being cleaned. The floor is flooded, the lights do not work and women have stopped using it after dark.`,
  ],
  FOODSTALL: [
    (p) => `The food stall operating outside ${p} is preparing food beside an open drain and washing utensils in a single bucket that is reused all day. It serves a large number of office workers at lunchtime.`,
    (p) => `Cooked food is being kept uncovered at the stall near ${p} through the afternoon, with flies settling on it. There is no handwashing arrangement visible.`,
  ],
  FOODSTORAGE: [
    (p) => `A shop near ${p} is storing raw chicken in an unrefrigerated container at the front of the stall through the day. The smell is noticeable from across the road.`,
    (p) => `Sacks of grain and flour are being stored directly on a damp floor at the back of the shop near ${p}, and there are signs of rodent activity around them.`,
  ],
  TREEFALL: [
    (p) => `A large branch came down across the road near ${p} during last night's wind and is blocking one lane. Nobody was hurt but it fell at around 11 PM when people were still out.`,
    (p) => `A tree has fallen against the compound wall at ${p} and is resting on the electrical line. It has not come down fully but it is clearly unstable.`,
  ],
  DEAD_TREE: [
    (p) => `The tree outside ${p} is dead and has been for at least a year. The trunk is hollow at the base and pieces of bark come away in the wind. It stands directly over a parking area and a bus stop.`,
    (p) => `A large tree near ${p} is leaning towards the building after the last spell of rain and several roots have lifted out of the soil.`,
  ],
  PARKDAMAGE: [
    (p) => `The swings in the children's play area at ${p} have broken chains and one seat is hanging by a single link. Children are still using them because there is nothing else in the area.`,
    (p) => `The boundary railing of the garden at ${p} has collapsed over about six metres and the exposed ends are sharp. Stray cattle have started entering through the gap.`,
  ],
  HAWKER: [
    (p) => `Stalls have taken over the full width of the footpath at ${p} so that pedestrians walk on the carriageway alongside moving traffic. This has grown steadily over the last few months.`,
    (p) => `Hawking has spread into the approach road at ${p} and now blocks the entrance that ambulances use. Deliveries to the stalls are also being unloaded in the middle of the road.`,
  ],
  ENCROACHMENT: [
    (p) => `A shop near ${p} has extended its display and a temporary shed onto the footpath, leaving no walking space at all. Wheelchair users and people with prams cannot pass.`,
    (p) => `Building material and a parked handcart have permanently occupied the footpath outside ${p}. The path has effectively not existed for two months.`,
  ],
  SEWAGE: [
    (p) => `Sewage is surfacing from a chamber near ${p} and running along the road. It has been like this for four days and the smell is severe in the lane behind. Children pass this spot on their way to school.`,
    (p) => `The sewer line near ${p} has backed up and is overflowing into the storm-water drain. The two are clearly connected somewhere upstream.`,
  ],
  DAMP: [
    (p) => `The retaining wall beside ${p} has visible damp across a large area, with efflorescence and algae growth. Water seeps out continuously even when there has been no rain for days.`,
    (p) => `The underside of the flyover at ${p} is soaked and dripping onto the footpath, and the concrete has begun to spall in one corner.`,
  ],
  SPITTING: [
    (p) => `The stairway wall at ${p} is stained from top to bottom with paan and gutka. It has been painted twice and returns within weeks. There is no bin or signage anywhere on that stretch.`,
    (p) => `The corner beside ${p} is used for spitting throughout the day and the wall and floor are permanently stained.`,
  ],
  DEFACED: [
    (p) => `The compound wall at ${p} has been covered in political posters and advertising stickers, pasted over one another. The wall was repainted by residents six months ago.`,
    (p) => `The bus shelter near ${p} has been written on and its panels covered with stickers to the point where the route information cannot be read.`,
  ],
  URINATION: [
    (p) => `The wall along the side lane at ${p} is being used as an open urinal, mostly in the mornings and late at night. The smell reaches the ground-floor flats and there is no public facility within reasonable walking distance.`,
    (p) => `The corner behind ${p} is used daily for urination. It is next to a food stall, which is the reason residents have been raising it.`,
  ],
  NOISE: [
    (p) => `Construction work at the site near ${p} continues well past 11 PM most nights, including breaking and drilling. Residents in the buildings opposite have not been able to sleep properly for the past three weeks.`,
    (p) => `Loudspeakers are being run at high volume outside ${p} from early morning until late at night. This has been going on for over a week.`,
  ],
  STRAY: [
    (p) => `A group of stray dogs near ${p} has become aggressive towards people walking past in the early morning. One person was bitten last week. They appear to be guarding a litter beneath a parked vehicle.`,
    (p) => `An injured dog has been lying near ${p} for two days and is unable to stand. It needs to be picked up by someone who can handle it.`,
  ],
  OTHER: [
    (p) => `The bus shelter at ${p} has lost two of its roof panels and offers no cover at all. People wait in the sun and rain beside it. It has been in this state since the storm in June.`,
    (p) => `The boundary railing beside the nallah at ${p} is broken over a five-metre stretch, leaving an open drop straight into the channel. It is unlit at night.`,
  ],
};

/** Officer notes, so the work history reads like work rather than status flips. */
export const OFFICER_NOTES = {
  assigned: [
    "Site visit scheduled for tomorrow morning.",
    "Allocated to the ward gang for inspection this week.",
    "Passed to the contractor covering this stretch.",
    "Inspection planned along with the adjacent complaint in the same lane.",
  ],
  work_started: [
    "Material arranged; work started this morning.",
    "Gang on site. Traffic diversion put in place for the duration.",
    "Repair begun after the utility line was traced and marked.",
    "Cleaning started; a second round is scheduled for tomorrow.",
  ],
  work_completed: [
    "Work completed and the site cleared. Photograph attached.",
    "Repair finished; the surface will be checked again after the next rain.",
    "Replacement fitted and tested on site.",
    "Cleared and disinfected. Collection frequency for this point increased.",
  ],
  rejected: [
    "Location falls under the railway authority, not the corporation. Forwarded to them and the resident informed.",
    "The photograph shows private premises, which are outside municipal jurisdiction.",
    "Duplicate of a report already closed for the same location last week.",
  ],
  reopened: [
    "Resident reports the problem has returned within days of the repair.",
    "Re-inspection confirms the work did not hold. Referred back to the contractor.",
  ],
};

/** What residents say in the comment thread under a public report. */
export const COMMENTS = {
  corroborate: [
    "Same problem here, I pass this every morning on the way to the station.",
    "Confirming this. It has been like this for at least two weeks now.",
    "We reported this from our building as well last month and nothing happened.",
    "This is correct. It gets much worse after it rains.",
    "I can confirm, my daughter's school van takes this road and has to stop.",
  ],
  detail: [
    "It is worst between 8 and 10 in the morning when the school buses come through.",
    "There is an elderly couple on the ground floor who cannot get past this at all.",
    "The same thing happened at the next corner about two months ago and was fixed within a week.",
    "Adding that the nearest streetlight is also not working, which makes it harder to see.",
    "The shopkeepers there have been putting a barrier out themselves every evening.",
  ],
  dispute: [
    "This was attended to yesterday afternoon, though only partly.",
    "I think the location is slightly off; the actual spot is about fifty metres further down.",
  ],
  resolved_already: [
    "This has been repaired now. Work was done over the weekend.",
    "Cleared this morning. Thank you to whoever followed it up.",
  ],
  official: [
    "Inspected today. Work order raised with the contractor for this stretch.",
    "Noted. This is scheduled in the current week's programme for the ward.",
    "Material has been arranged and work will begin on Monday.",
  ],
};

/**
 * What the classifier plausibly mistakes for what.
 *
 * A resident correction is only meaningful if the two categories could
 * actually be confused in a photograph. Recording that "pothole" was corrected
 * to "pothole" would put a nonsense row on the AI performance screen, and
 * recording that a pothole was mistaken for an unhygienic food stall would put
 * a dishonest one there. These pairs are ones the model genuinely struggles to
 * separate: the same visual subject, or the same scene at a different stage.
 */
export const CONFUSABLE = {
  POTHOLE: ["ROADCRACK", "MANHOLE"],
  ROADCRACK: ["POTHOLE", "FOOTPATH"],
  MANHOLE: ["POTHOLE", "DRAINBLOCK"],
  FOOTPATH: ["ROADCRACK", "ENCROACHMENT"],
  ROADOBST: ["DEBRIS", "PARKING"],
  GARBAGE: ["DUMPING", "DEBRIS"],
  DUMPING: ["GARBAGE", "DEBRIS"],
  DEBRIS: ["DUMPING", "ROADOBST"],
  DEADANIMAL: ["STRAY", "GARBAGE"],
  LEAK: ["PIPELINE", "DAMP", "SEWAGE"],
  PIPELINE: ["LEAK", "FLOOD"],
  NOWATER: ["CONTAMINATED", "LEAK"],
  CONTAMINATED: ["LEAK", "STAGNANT"],
  FLOOD: ["STAGNANT", "DRAINBLOCK"],
  DRAINBLOCK: ["SEWAGE", "FLOOD"],
  SEWAGE: ["DRAINBLOCK", "LEAK"],
  DAMP: ["LEAK", "SPITTING"],
  STAGNANT: ["FLOOD", "MOSQUITO"],
  MOSQUITO: ["STAGNANT", "GARBAGE"],
  STREETLIGHT: ["DAMAGEDPOLE", "EXPOSEDWIRE"],
  DAMAGEDPOLE: ["STREETLIGHT", "EXPOSEDWIRE"],
  EXPOSEDWIRE: ["DAMAGEDPOLE", "STREETLIGHT"],
  SIGNAL: ["SIGNBOARD", "DAMAGEDPOLE"],
  SIGNBOARD: ["SIGNAL"],
  PARKING: ["ROADOBST", "ENCROACHMENT"],
  ENCROACHMENT: ["HAWKER", "PARKING"],
  HAWKER: ["ENCROACHMENT", "FOODSTALL"],
  FOODSTALL: ["FOODSTORAGE", "HAWKER"],
  FOODSTORAGE: ["FOODSTALL"],
  TOILET: ["URINATION"],
  URINATION: ["TOILET", "SPITTING"],
  SPITTING: ["DAMP", "DEFACED"],
  DEFACED: ["SPITTING"],
  TREEFALL: ["DEAD_TREE"],
  DEAD_TREE: ["TREEFALL"],
  PARKDAMAGE: ["DEBRIS"],
  STRAY: ["DEADANIMAL"],
};

/**
 * The conversation between a ward office and the institution working on its
 * challenge, which happens on the challenge rather than inside a project.
 *
 * Written as pairs so the thread reads as an exchange. These are the questions
 * a department actually asks — access, timing, who is liable when a student is
 * standing in a live carriageway — rather than generic encouragement.
 */
export const CHALLENGE_THREADS = [
  [
    ["staff", "The ward engineer can accompany your team on Tuesday or Thursday mornings. Anything involving opening a chamber has to have him present, so please plan the survey rounds around those two days."],
    ["campus", "Thursday works for both survey rounds. We have listed the chambers we need opened in the shared folder so he can see the list before he arrives rather than on the day."],
  ],
  [
    ["staff", "Before the field work starts we need the insurance and indemnity position in writing for any student working on a carriageway. That has held up two projects before this one."],
    ["campus", "Sent this morning from the registrar's office, covering all six team members for the project period. Happy to add anyone we bring on later as an addendum."],
  ],
  [
    ["staff", "Can you share the interim findings before the full report? The capital works list for next year closes at the end of the month and if there is anything in your data we should be costing, we need it now rather than in December."],
    ["campus", "Sending the interim summary by Friday. The one finding we are confident about already is the outfall level, which is independent of the rest of the analysis."],
  ],
  [
    ["staff", "Two residents have asked the ward office what the equipment on the poles is for. Could you send something short we can put on the noticeboard, in Marathi and English?"],
    ["campus", "Drafted both and sent them over. We have kept it to four lines and included a contact number at the department rather than at the institute, since people will call whoever is nearest."],
  ],
  [
    ["staff", "The department would like the raw data as well as the report. Previous studies handed us conclusions we could not re-check once the students had graduated."],
    ["campus", "Agreed, and it is in the deliverables — raw measurements in CSV plus the analysis scripts. We would rather it were re-checked than taken on trust."],
  ],
  [
    ["staff", "Please note the collection round timing changed last month, so any baseline taken before then is against a different schedule. I should have flagged it earlier."],
    ["campus", "That is useful and does affect us — four of our measurement days fall before the change. We will split the baseline at that date rather than averaging across it."],
  ],
  [
    ["staff", "Is there any reason this could not be extended to the two adjacent wards later? Not a commitment, just so we know whether the method depends on anything specific to this one."],
    ["campus", "Nothing specific to this ward except the survey itself. The method and the scoring are written to be repeated, which is why we are documenting them as a deliverable."],
  ],
];

/** Moderation reasons, for the hidden comments the audit trail keeps. */
export const MODERATION = [
  "Personal contact details posted publicly.",
  "Abusive language directed at a named employee.",
  "Unrelated commercial advertising.",
];
