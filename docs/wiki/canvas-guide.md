# Canvas guide

## Choose, then place

The sidebar is both workspace navigation and a contextual library. Under **Canvas → Modules**, search by module name, category, or description. Clicking an item selects its description; it does not create a module. Drag the item to a position, or click **Place module** and then choose a canvas position.

Under **Sources**, each imported dataset can be dragged onto the canvas or inserted with **Place source**. Clicking its name opens the Datasets view. Importing a file creates a reusable asset and zero modules until you place a source.

The same module type can appear repeatedly. To compare two parameter choices, duplicate a module, place the copy, connect its inputs, and configure it independently. Duplication copies settings but does not copy wires.

## Search at the point of use

| Action                                | Result                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Right-click empty canvas              | Search and insert at that location                                           |
| Shift+A while canvas has focus        | Search at the pointer, or choose a placement if the pointer is outside       |
| Add module button                     | Search, then click the placement position                                    |
| Drag an output wire into empty canvas | Search compatible modules; choosing one creates the module and wire together |
| Escape                                | Cancel search or placement                                                   |

Search and cancelled placement leave the graph unchanged. The placement banner identifies what will be created.

## Connect and branch

Drag between compatible handles, or click the output and then the input. A handle's name identifies its port. Compatibility is based on **table**, **series**, or **frame**, not the module's visual position.

One output may feed multiple downstream modules. Align timestamps requires at least two series; Chart accepts multiple series/frame connections. Other inputs accept one connection. Self-connections, cycles, duplicate connections, incompatible types, and connections beyond the 120-wire limit are rejected before insertion.

Select a module to configure it in the floating inspector. Available columns come from its actual connected data. The inspector also lists incoming connections for disconnection. Select an edge and press Delete to remove a wire. Deleting a module also removes its incident wires.

## History and navigation

Undo/Redo are available in the canvas toolbar and the global Edit menu. With canvas focus, use Ctrl+Z and Ctrl+Shift+Z; Command equivalents work on macOS, and Ctrl+Y also redoes. Text fields retain their normal editing behavior.

A drag is one undo step. Inserting a connected module and deleting a module with its wires are also single transactions. History keeps up to 50 edits in memory and is not saved in a project file.

Canvas, Datasets, and Results have separate URL hash routes. Browser Back/Forward navigates between them. Leaving Canvas preserves its viewport and selected module; unfinished placement is cancelled when leaving. Selecting **Edit in canvas** from Results centers the referenced module.

## Read execution state

The footer summarizes computation and module failures. A module can be ready, error, or blocked by an upstream result. An invalid branch does not stop independent valid branches. **Ready** means the calculation completed; it does not mean the result is useful, causal, or predictive. Review units, sample counts, missing values, and the [numerical contract](../analytics.md).
