import './home.css'
import { updateDimensionalRange } from '../lib/dimensionalRange'
import { createDimensionalExampleAlphadex } from './dimensionalExampleAlphadex'
import { createDimensionalExampleNumeric } from './dimensionalExampleNumeric'
import { numberToAlphadex } from './alphadex'
import {
  HOME_DEMO_DEFAULT_CENTER_INPUT,
  HOME_DEMO_RANGE_IDS,
} from './homeDemoConstants'
import { mountMockDataDemo } from './mockDataDemo'

function applyHomeCenterInput(raw: string) {
  const value = Number.parseFloat(raw.trim())
  if (!Number.isFinite(value)) return
  updateDimensionalRange(HOME_DEMO_RANGE_IDS.mock, value)
  updateDimensionalRange(HOME_DEMO_RANGE_IDS.numeric, value)
  updateDimensionalRange(HOME_DEMO_RANGE_IDS.alphadex, numberToAlphadex(value))
}

function buildHome() {
  const host = document.getElementById('range-demo')
  if (!host) return

  host.replaceChildren()

  const root = document.createElement('div')
  root.id = 'demo-home-root'

  const header = document.createElement('header')
  header.id = 'demo-home-header'
  const title = document.createElement('h1')
  title.textContent = 'open-range — demos'

  const controls = document.createElement('div')
  controls.id = 'demo-home-controls'
  controls.className = 'demo-home-controls'
  const controlLabel = document.createElement('label')
  controlLabel.htmlFor = 'home-center-input'
  controlLabel.textContent = 'Center input (numeric seed for all axes)'
  const input = document.createElement('input')
  input.type = 'number'
  input.step = 'any'
  input.id = 'home-center-input'
  input.setAttribute('data-testid', 'home-center-input')
  input.value = String(HOME_DEMO_DEFAULT_CENTER_INPUT)
  input.setAttribute('aria-label', 'Center input for all axes')
  const applyBtn = document.createElement('button')
  applyBtn.type = 'button'
  applyBtn.textContent = 'Apply'
  applyBtn.setAttribute('data-testid', 'home-apply-center')
  applyBtn.addEventListener('click', () => {
    applyHomeCenterInput(input.value)
  })
  controls.appendChild(controlLabel)
  controls.appendChild(input)
  controls.appendChild(applyBtn)

  const nav = document.createElement('nav')
  nav.id = 'demo-home-nav'
  const links: [string, string][] = [
    ['#section-mock-data', 'Mock data axis'],
    ['#section-dimensional', 'Dimensional examples'],
    ['#mount-alphadex', 'Alphadex panel'],
    ['#mount-numeric', 'Numeric + tickmarks'],
  ]
  for (const [href, label] of links) {
    const a = document.createElement('a')
    a.href = href
    a.textContent = label
    nav.appendChild(a)
  }
  const span = document.createElement('span')
  span.className = 'demo-home-muted'
  span.textContent = ' · '
  nav.appendChild(span)
  const standalone = document.createElement('a')
  standalone.href = '/mock-data-demo.html'
  standalone.textContent = 'Open mock-only page'
  nav.appendChild(standalone)

  header.appendChild(title)
  header.appendChild(controls)
  header.appendChild(nav)

  const mockSection = document.createElement('section')
  mockSection.id = 'section-mock-data'
  mockSection.className = 'demo-home-section'
  const mockH2 = document.createElement('h2')
  mockH2.textContent = 'Mock intervals · IndexedDB · tick grid · fine pan'
  const mockMount = document.createElement('div')
  mockMount.id = 'mock-data-demo'
  mockSection.appendChild(mockH2)
  mockSection.appendChild(mockMount)

  const dimSection = document.createElement('section')
  dimSection.id = 'section-dimensional'
  dimSection.className = 'demo-home-section'
  const dimH2 = document.createElement('h2')
  dimH2.textContent = 'Dimensional range (string vs number input)'
  const row = document.createElement('div')
  row.id = 'dimensional-examples-row'
  const mountA = document.createElement('div')
  mountA.id = 'mount-alphadex'
  const mountN = document.createElement('div')
  mountN.id = 'mount-numeric'
  row.appendChild(mountA)
  row.appendChild(mountN)
  dimSection.appendChild(dimH2)
  dimSection.appendChild(row)

  root.appendChild(header)
  root.appendChild(mockSection)
  root.appendChild(dimSection)
  host.appendChild(root)

  const seed = HOME_DEMO_DEFAULT_CENTER_INPUT
  mountMockDataDemo({ embedded: true, initialCenterInput: seed })
  createDimensionalExampleAlphadex({
    layout: 'flow',
    parent: mountA,
    initialCenterInput: seed,
  })
  createDimensionalExampleNumeric({
    layout: 'flow',
    parent: mountN,
    initialCenterInput: seed,
  })
}

buildHome()
