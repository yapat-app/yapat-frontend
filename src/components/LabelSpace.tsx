import { List, Tag, Tooltip } from "antd";
import { useState } from "react";
import { useParams, useLocation } from "react-router-dom";

export const LabelSpace: React.FC = () => {
  const [search, setSearch] = useState("");
  const { pathname } = useLocation();

  const labels = [
    {
      taxon_id: "gbif:1045851",
      canonical_name: "Amarygmus",
      scientific_name: "Amarygmus Dalman, 1823",
      rank: "GENUS",
      kingdom: "Animalia",
      status: "ACCEPTED",
    },
    {
      taxon_id: "gbif:1235515",
      canonical_name: "Amphialus",
      scientific_name: "Amphialus F.P.Pascoe, 1883",
      rank: "GENUS",
      kingdom: "Animalia",
      status: "ACCEPTED",
    },
    {
      taxon_id: "gbif:2264526",
      canonical_name: "Anomalorhiza",
      scientific_name: "Anomalorhiza Light, 1921",
      rank: "GENUS",
      kingdom: "Animalia",
      status: "ACCEPTED",
    },
    {
      taxon_id: "gbif:2206449",
      canonical_name: "Antennulosignum",
      scientific_name: "Antennulosignum Nordenstam, 1933",
      rank: "GENUS",
      kingdom: "Animalia",
      status: "ACCEPTED",
    },
    {
      taxon_id: "gbif:8298429",
      canonical_name: "Apodothina",
      scientific_name: "Apodothina Petrak, 1970",
      rank: "GENUS",
      kingdom: "Fungi",
      status: "ACCEPTED",
    },
    {
      taxon_id: "gbif:12176755",
      canonical_name: "Arcartia",
      scientific_name: "Arcartia Dana, 1846",
      rank: "GENUS",
      kingdom: "Animalia",
      status: "ACCEPTED",
    },
    {
      taxon_id: "gbif:4818942",
      canonical_name: "Azabbaremys",
      scientific_name: "Azabbaremys Gaffney, Moody & Walker, 2001",
      rank: "GENUS",
      kingdom: "Animalia",
      status: "ACCEPTED",
    },
    {
      taxon_id: "ENVO:01001250",
      canonical_name: "finfish farming process",
      scientific_name: "finfish farming process",
      rank: "ENVO",
      kingdom: null,
      status: "ACCEPTED",
    },
    {
      taxon_id: "GBIF:167096282",
      canonical_name: "Frog adenovirus",
      scientific_name: "Frog adenovirus",
      rank: "GBIF",
      kingdom: null,
      status: "ACCEPTED",
    },
    {
      taxon_id: "GBIF:177592207",
      canonical_name: "frog metagenome",
      scientific_name: "frog metagenome",
      rank: "GBIF",
      kingdom: null,
      status: "ACCEPTED",
    },
  ];

  const customLabels = [
    {
      name: "Taxonomy for wind",
      description: "",
      id: 6,
      taxonomy_id: "custom:06b2fa37",
      team_id: 1,
      created_by_user_id: 1,
      taxonomy_data: {
        nodes: [
          {
            id: "46b6d07b-5eb4-4193-b542-48727794e239",
            name: "Chaerephon pumilus bat alphacoronavirus/Bat143/Eswatini/2014",
            added_at: "2026-02-04T14:14:07.516951",
            metadata: {
              iri: "https://www.gbif.org/species/193770817",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:193770817",
            scientific_name:
              "Chaerephon pumilus bat alphacoronavirus/Bat143/Eswatini/2014",
          },
          {
            id: "e1f76323-50ca-4dc2-a2a7-00098db6c451",
            name: "Chaerephon pumilus bat alphacoronavirus/Bat151/Eswatini/2014",
            added_at: "2026-02-04T14:14:11.109410",
            metadata: {
              iri: "https://www.gbif.org/species/193770816",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:193770816",
            scientific_name:
              "Chaerephon pumilus bat alphacoronavirus/Bat151/Eswatini/2014",
          },
          {
            id: "f5664769-694a-4db5-b6aa-9c98a8eb2898",
            name: "atmospheric wind intensity",
            added_at: "2026-02-04T14:18:08.370340",
            metadata: {
              iri: "http://purl.obolibrary.org/obo/ENVO_09200003",
              rank: "ENVO",
              tool: "ols_search_terms",
              score: null,
              family: null,
              source: "envo",
              kingdom: null,
              description: "The intensity of a atmospheric wind.",
            },
            taxon_id: "ENVO:09200003",
            scientific_name: "atmospheric wind intensity",
          },
        ],
        metadata: {
          created_at: "2026-02-04T14:18:22.941014",
          total_species: 3,
          created_from_conversation: 9377,
        },
      },
      status: "active",
      is_global: false,
      created_at: "2026-02-04T14:18:22.924506Z",
      updated_at: null,
    },
    {
      name: "Bats",
      description: "bats",
      id: 5,
      taxonomy_id: "custom:de756d0f",
      team_id: 1,
      created_by_user_id: 1,
      taxonomy_data: {
        nodes: [
          {
            id: "43aa04e1-4364-4437-aadd-3c3e5f469857",
            name: "unclassified Lasiurus (in: bats)",
            added_at: "2026-02-04T13:39:22.085286",
            metadata: {
              iri: "https://www.gbif.org/species/177678488",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:177678488",
            scientific_name: "unclassified Lasiurus (in: bats)",
          },
          {
            id: "26e33787-9678-4ba2-9f56-473ffed27dbc",
            name: "Lasiurus sp. (in: bats)",
            added_at: "2026-02-04T13:39:23.261561",
            metadata: {
              iri: "https://www.gbif.org/species/177678492",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:177678492",
            scientific_name: "Lasiurus sp. (in: bats)",
          },
          {
            id: "4e93a4f6-760e-4a3f-8b6a-cdabbdff56cd",
            name: "Tadarida Rafinesque, 1814",
            added_at: "2026-02-04T13:39:24.911759",
            metadata: {
              iri: "https://www.gbif.org/species/2433008",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:2433008",
            scientific_name: "Tadarida Rafinesque, 1814",
          },
          {
            id: "555951b4-cdc7-46ea-939f-47ea175f1970",
            name: "unclassified Lasiurus (in: bats)",
            added_at: "2026-02-04T13:39:26.345405",
            metadata: {
              iri: "https://www.gbif.org/species/166398965",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:166398965",
            scientific_name: "unclassified Lasiurus (in: bats)",
          },
        ],
        metadata: {
          created_at: "2026-02-04T13:39:32.562081",
          total_species: 4,
          created_from_conversation: 9376,
        },
      },
      status: "active",
      is_global: false,
      created_at: "2026-02-04T13:39:32.558770Z",
      updated_at: null,
    },
    {
      name: "Wolves and birds",
      description: "These taxonomies are used for annotating wolves and birds",
      id: 4,
      taxonomy_id: "custom:12b6fa08",
      team_id: 1,
      created_by_user_id: 1,
      taxonomy_data: {
        nodes: [
          {
            id: "51ac805e-c2c3-4796-b9b2-52dd3bc11f32",
            name: "Hildebrandtia (frog)",
            added_at: "2026-02-04T13:18:13.857110",
            metadata: {
              iri: "https://www.gbif.org/species/311626141",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:311626141",
            scientific_name: "Hildebrandtia (frog)",
          },
          {
            id: "60e9c1a5-df62-4692-ba1a-4e8440c2dda2",
            name: "Karekandel Wolf",
            added_at: "2026-02-04T13:25:23.315832",
            metadata: {
              iri: "https://www.gbif.org/species/105518424",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:105518424",
            scientific_name: "Karekandel Wolf",
          },
          {
            id: "3806ef66-8cf0-48c7-88fd-c6470b23160b",
            name: "Agrimonioides Wolf",
            added_at: "2026-02-04T13:25:23.315899",
            metadata: {
              iri: "https://www.gbif.org/species/105519026",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:105519026",
            scientific_name: "Agrimonioides Wolf",
          },
          {
            id: "4544eefa-b7ad-4b97-9cef-b507ca8d6043",
            name: "Mutellina Wolf",
            added_at: "2026-02-04T13:25:23.315907",
            metadata: {
              iri: "https://www.gbif.org/species/103340523",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:103340523",
            scientific_name: "Mutellina Wolf",
          },
          {
            id: "f2dea617-9678-4638-ab4f-751580f3edc7",
            name: "Catunaregam Wolf",
            added_at: "2026-02-04T13:25:23.315913",
            metadata: {
              iri: "https://www.gbif.org/species/2910885",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:2910885",
            scientific_name: "Catunaregam Wolf",
          },
          {
            id: "85d91e08-2f3e-4f88-97da-71cb5c020472",
            name: "Bulbine Wolf",
            added_at: "2026-02-04T13:25:23.315920",
            metadata: {
              iri: "https://www.gbif.org/species/163546261",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:163546261",
            scientific_name: "Bulbine Wolf",
          },
          {
            id: "0ae9b726-5fa2-4d23-8ca1-b015b629bbe5",
            name: "Homo Linnaeus, 1758",
            added_at: "2026-02-04T13:25:39.163439",
            metadata: {
              iri: "https://www.gbif.org/species/2436435",
              rank: "GBIF",
              tool: "gbif_search_species",
              score: null,
              family: null,
              source: "gbif",
              kingdom: null,
              description: null,
            },
            taxon_id: "GBIF:2436435",
            scientific_name: "Homo Linnaeus, 1758",
          },
        ],
        metadata: {
          created_at: "2026-02-04T13:26:12.747117",
          total_species: 7,
          created_from_conversation: 9375,
        },
      },
      status: "active",
      is_global: false,
      created_at: "2026-02-04T13:26:12.741944Z",
      updated_at: null,
    },
  ];

  const getUniqueRanks = (labels: any[], taxonomies: any[]) => {
    // From first labels array
    const ranks1 = labels.map((label) => label.rank).filter(Boolean);

    // From second taxonomies array (flatten all nodes.metadata.rank)
    const ranks2 = taxonomies
      .flatMap((taxonomy: any) => taxonomy.taxonomy_data.nodes)
      .map((node: any) => node.metadata.rank)
      .filter(Boolean);

    // Combine, dedupe, sort
    return Array.from(new Set([...ranks1, ...ranks2])).sort();
  };

  const anatologies = [
    {
      name: "GBIF",
    },
    {
      name: "ENVO",
    },
  ];

  const filteredLabels = labels.filter((label) =>
    label.canonical_name.toLowerCase().includes(search.toLowerCase()),
  );

  const renderLabelItem = (label: (typeof labels)[0]) => (
    <div className="py-1.5 flex items-center justify-between  w-full ">
      <div className="  ">
        <div className="flex items-center justify-between ">
          <div className="flex-1">
            <span className="font-ibm-sans text-sm! text-gray-900">
              {label.canonical_name || label.scientific_name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {label.rank && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
              {label.rank}
            </span>
          )}
          {label.kingdom && (
            <span className="text-xs text-gray-600">{label.kingdom}</span>
          )}
          {label.status && label.status !== "ACCEPTED" && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 capitalize">
              {label.status}
            </span>
          )}
          {label.scientific_name &&
            label.scientific_name !== label.canonical_name && (
              <span className="text-xs text-blue-600 italic">
                {label.scientific_name}
              </span>
            )}
        </div>
      </div>
      {pathname != "/taxonomy" ? (
        <div className="">
          <Tooltip title="Annotate">
            <button className="w-6 h-6 flex items-center justify-center  bg-green-500 hover:bg-green-200 border border-green-300 rounded-md ml-3 ">
              <Tag key={"green"} color={"green"} variant={"filled"}>
                ✓ Annotate
              </Tag>
            </button>
          </Tooltip>
        </div>
      ) : (
        <div>
          <div className="">
            <Tooltip title="Remove">
              <button className="w-6 h-6 flex items-center justify-center  bg-green-500 hover:bg-green-200 border border-green-300 rounded-md ml-3 ">
                <Tag key={"red"} color={"red"} variant={"filled"}>
                  x
                </Tag>
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );

  const uniqueRanks = getUniqueRanks(labels, customLabels);

  return (
    <div className="w-full flex flex-col h-full gap-10 ">
      {/* Label Space - grows to fill available space */}
      <div className="flex flex-col  h-[70%]">
        <h3 className="text-m font-semibold mb-1 font-ibm-sans">Label Space</h3>

        <div className="border border-gray-200 rounded-md px-3 py-4 flex flex-col h-full">
          {/* Search bar */}
          <div className="mb-2 flex-shrink-0">
            <input
              placeholder="Search labels"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            />
          </div>

          {/* Scrollable list */}
          <div className="overflow-y-auto">
            <List
              dataSource={filteredLabels}
              size="small"
              split={false}
              renderItem={(item) => (
                <List.Item
                  key={item.value}
                  className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 rounded"
                >
                  {renderLabelItem(item)}
                </List.Item>
              )}
            />
          </div>
        </div>
      </div>

      {/* Ontologies - only takes space it needs */}
      <div className="flex flex-col h-[20%] ">
        <h3 className="text-l font-semibold mb-1 font-ibm-sans">Ontologies</h3>

        <div className="flex flex-row gap-2 flex-wrap mt-1">
          {uniqueRanks.map((rank, index) => (
            <Tag key={rank ?? index} color="green" variant="outlined">
              {rank}
            </Tag>
          ))}
        </div>
      </div>
    </div>
  );
};
