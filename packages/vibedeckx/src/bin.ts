#!/usr/bin/env node

import "./instrumentation.js";
import { run } from "@stricli/core";
import { program } from "./command.js";

run(program, process.argv.slice(2), { process });
